import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API: Get all users
  app.get("/api/users", async (req, res) => {
    const { data, error } = await supabase
      .from("users")
      .select("*");
    
    if (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ error: error.message });
    }
    
    const users = data.map(u => ({
      id: u.id,
      name: u.name,
      password: u.password,
      organization: u.organization,
      level: u.level,
      isTraining: u.is_training,
      spreadsheetId: u.spreadsheet_id
    }));
    
    res.json(users);
  });

  // API: Update/Create user
  app.post("/api/users", async (req, res) => {
    const user = req.body;
    const { data, error } = await supabase
      .from("users")
      .upsert({
        id: user.id,
        name: user.name,
        password: user.password,
        organization: user.organization,
        level: user.level,
        is_training: user.isTraining,
        spreadsheet_id: user.spreadsheetId
      });

    if (error) {
      console.error("Error saving user:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // API: Get all sessions
  app.get("/api/sessions", async (req, res) => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
      return res.status(500).json({ error: error.message });
    }
    
    // Map snake_case to camelCase if needed, but here we'll just return as is
    // and handle it in the frontend if necessary.
    // Actually, let's keep it simple and match the frontend types.
    const sessions = data.map(s => ({
      id: s.id,
      ownerId: s.owner_id,
      ownerName: s.owner_name,
      date: s.date,
      location: s.location,
      buddy: s.buddy,
      note: s.note,
      entries: s.entries || []
    }));
    
    res.json(sessions);
  });

  // API: Save session
  app.post("/api/sessions", async (req, res) => {
    const session = req.body;
    const { data, error } = await supabase
      .from("sessions")
      .upsert({
        id: session.id,
        owner_id: session.ownerId,
        owner_name: session.ownerName,
        date: session.date,
        location: session.location,
        buddy: session.buddy,
        note: session.note,
        entries: session.entries
      });

    if (error) {
      console.error("Error saving session:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // API: Delete session
  app.delete("/api/sessions/:id", async (req, res) => {
    const sessionId = req.params.id;
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      console.error("Error deleting session:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
