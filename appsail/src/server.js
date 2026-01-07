import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "salla-returns-backend",
    time: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT;
  if (!PORT) {
    throw new Error("X_ZOHO_CATALYST_LISTEN_PORT not provided by AppSail");
  }

  app.listen(PORT, () => {
    console.log(`🚀 AppSail listening on port ${PORT}`);
  });
