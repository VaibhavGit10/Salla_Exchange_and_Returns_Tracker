// appsail/src/services/filestore.service.ts
// Return-evidence uploads via Catalyst FileStore. Per-tenant, max 5 files/return, 5MB, JPG/PNG.
// Catalyst uploadFile() wants a ReadStream → Readable.from(buffer). Stores a sha256 checksum.
import { Readable } from "stream";
import crypto from "crypto";
import { getCatalystApp } from "../lib/catalyst";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { ReturnAttachmentsRepo, ReturnAttachmentRow } from "../repositories/returnAttachments.repo";
import { UsageMonthlyRepo } from "../repositories/usageMonthly.repo";
import { logger } from "../lib/logger";

const MAX_FILES_PER_RETURN = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/jpg"];

export type AttachmentRecord = {
  ROWID?: string;
  tenant_id: string;
  return_request_id: string;
  filestore_path: string;
  content_type: string;
  file_size_bytes: number;
};

export class FileStoreService {
  static async uploadReturnImage(
    req: any,
    tenantId: string,
    returnRequestId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    actor: { type?: string; id?: string } = {}
  ): Promise<AttachmentRecord> {
    const folderId = String(env.FILESTORE_FOLDER_ID || "").trim();
    if (!folderId) throw new AppError(500, "FileStore folder not configured", "FILESTORE_NOT_CONFIGURED");
    if (!ALLOWED_MIME.includes(file.mimetype.toLowerCase())) throw new AppError(400, "Only JPG and PNG images are allowed", "INVALID_FILE_TYPE");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new AppError(400, `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`, "FILE_TOO_LARGE");

    const existing = await ReturnAttachmentsRepo.countByReturnRequest(req, tenantId, returnRequestId);
    if (existing >= MAX_FILES_PER_RETURN) throw new AppError(400, `Maximum ${MAX_FILES_PER_RETURN} files per return`, "MAX_FILES_EXCEEDED");

    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safeName = `${tenantId}_${returnRequestId}_${Date.now()}.${ext}`;
    const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const folder = getCatalystApp(req).filestore().folder(folderId);
    const uploaded: any = await folder.uploadFile({ code: Readable.from(file.buffer) as any, name: safeName });
    const fileId = String(uploaded?.id ?? uploaded?.file_id ?? "");
    const filestorePath = `${folderId}/${fileId}`;

    const inserted: any = await ReturnAttachmentsRepo.insert(req, {
      tenant_id: tenantId,
      return_request_id: returnRequestId,
      file_role: "evidence",
      filestore_path: filestorePath,
      content_type: file.mimetype,
      file_size_bytes: file.size,
      checksum_sha256: checksum,
      uploaded_by_actor_type: actor.type ?? "customer",
      uploaded_by_actor_id: actor.id ?? null,
      is_deleted: false,
    });

    UsageMonthlyRepo.increment(req, tenantId, "attachments_uploaded").catch((err) => logger.warn({ err: (err as any)?.message }, "usage increment failed"));

    return {
      ROWID: String(inserted?.ROWID ?? ""),
      tenant_id: tenantId,
      return_request_id: returnRequestId,
      filestore_path: filestorePath,
      content_type: file.mimetype,
      file_size_bytes: file.size,
    };
  }

  static async listReturnAttachments(req: any, tenantId: string, returnRequestId: string): Promise<ReturnAttachmentRow[]> {
    return ReturnAttachmentsRepo.listByReturnRequest(req, tenantId, returnRequestId);
  }
}
