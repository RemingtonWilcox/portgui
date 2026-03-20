use crate::models::ServiceEntry;

pub fn infer_restart_command(entry: &ServiceEntry) -> String {
    let command = entry.cmd.join(" ").to_lowercase();
    if command.contains("next dev") || command.contains("vite") {
        return "pnpm dev".into();
    }
    if command.contains("wrangler dev") {
        return "pnpm wrangler dev".into();
    }
    if command.contains("astro dev") {
        return "pnpm astro dev".into();
    }
    if command.contains("convex dev") {
        return "npx convex dev".into();
    }
    if command.contains("cargo run") {
        return "cargo run".into();
    }
    if command.contains("go run") {
        return "go run .".into();
    }
    if command.contains("http.server") {
        let port = entry.ports.first().copied().unwrap_or_default();
        let cwd = entry.cwd.as_deref().unwrap_or(".");
        return format!("python3 -m http.server {port} -d {cwd}");
    }
    if entry.process_name == "postgres" {
        return "brew services start postgresql".into();
    }
    if entry.process_name.contains("redis") {
        return "brew services start redis".into();
    }
    "pnpm dev".into()
}
