import React from "react";
import { Card } from "../../components/ui";

export default function NotFound() {
  return (
    <div className="center-screen">
      <Card style={{ maxWidth: 420, textAlign: "center" }}>
        <h2>Page not found</h2>
        <p className="muted">The page you're looking for doesn't exist.</p>
        <a className="btn btn-ghost" href="#/">Go home</a>
      </Card>
    </div>
  );
}
