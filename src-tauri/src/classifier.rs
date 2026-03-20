use crate::display_name::ProjectMetadata;
use std::path::Path;

const SPECIAL_PORTS: &[u16] = &[1234, 4321, 5432, 6379, 8787];

/// Dev-specific tool names — these ARE dev servers, not generic runtimes.
const DEV_TOOL_NAMES: &[&str] = &[
    "wrangler", "next", "vite", "playwright", "webpack", "esbuild",
    "astro", "nuxt", "remix", "gatsby", "hugo", "uvicorn", "flask",
    "http.server",
];

/// Generic runtimes that could be dev servers OR desktop apps (Electron, etc.).
/// These require project signals to confirm they're actually dev-related.
const GENERIC_RUNTIME_NAMES: &[&str] = &[
    "node", "python", "python3", "ruby", "cargo", "go", "java", "deno", "bun", "php",
];

const INFRA_PATTERNS: &[&str] = &[
    "postgres", "postmaster", "redis", "redis-server", "mysqld", "mongo", "mongod",
];

/// Known desktop apps that use Node/Electron but are NOT dev servers.
const KNOWN_DESKTOP_APPS: &[&str] = &[
    "discord", "slack", "spotify", "teams", "notion", "figma",
    "1password", "bitwarden", "signal", "telegram", "whatsapp",
    "obsidian", "linear", "loom", "postman", "insomnia",
    "cursor", "zed", "chrome", "brave", "arc", "firefox", "safari",
];

pub fn is_dev_related(
    process_name: &str,
    ports: &[u16],
    cmd: &[String],
    project: &ProjectMetadata,
    is_pinned: bool,
    is_hidden: bool,
) -> bool {
    if is_hidden {
        return false;
    }
    if is_pinned {
        return true;
    }

    let name_lower = process_name.to_lowercase();
    let cmd_lower: Vec<String> = cmd.iter().map(|s| s.to_lowercase()).collect();
    let executable_name = cmd
        .first()
        .map(|segment| {
            Path::new(segment)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(segment)
                .to_lowercase()
        })
        .unwrap_or_default();

    // Early reject: known desktop apps (Discord, Slack, etc.)
    let is_known_desktop = KNOWN_DESKTOP_APPS.iter().any(|app| {
        name_lower.contains(app) || executable_name.contains(app)
    });
    if is_known_desktop {
        return false;
    }

    let has_project_signal = project.has_project_markers
        || project.package_name.is_some()
        || project.cargo_name.is_some();

    // Infra services (postgres, redis, etc.) on known ports — always show
    let has_infra_name = INFRA_PATTERNS.iter().any(|p| name_lower.contains(p));
    if has_infra_name && ports.iter().any(|port| SPECIAL_PORTS.contains(port)) {
        return true;
    }

    // Dev tool names (vite, next, wrangler, etc.) — these ARE dev servers, show them
    let has_dev_tool_name = DEV_TOOL_NAMES.iter().any(|p| name_lower.contains(p));
    let has_dev_tool_command = cmd_lower
        .iter()
        .any(|s| DEV_TOOL_NAMES.iter().any(|p| s.contains(p)));
    if has_dev_tool_name || has_dev_tool_command {
        return true;
    }

    // Generic runtimes (node, python, etc.) — only if there's a project signal too.
    // This filters out Electron desktop apps (Discord, Figma, etc.) that happen to
    // use Node but aren't running in a project directory.
    let has_runtime_name = GENERIC_RUNTIME_NAMES.iter().any(|p| name_lower.contains(p));
    let has_runtime_command = cmd_lower
        .iter()
        .any(|s| GENERIC_RUNTIME_NAMES.iter().any(|p| s.contains(p)));
    if (has_runtime_name || has_runtime_command) && has_project_signal {
        return true;
    }

    // Project signal alone is enough (something listening on a port in a project dir)
    if has_project_signal {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_entries_are_suppressed() {
        assert!(!is_dev_related(
            "node",
            &[3000],
            &[],
            &ProjectMetadata::default(),
            false,
            true
        ));
    }

    #[test]
    fn pinned_entries_always_show() {
        assert!(is_dev_related(
            "launchd",
            &[1],
            &[],
            &ProjectMetadata::default(),
            true,
            false
        ));
    }

    #[test]
    fn infra_on_known_port_shows() {
        assert!(is_dev_related(
            "postgres",
            &[5432],
            &[],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }

    #[test]
    fn dev_tool_always_shows() {
        assert!(is_dev_related(
            "node",
            &[3000],
            &["node".into(), "next".into(), "dev".into()],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }

    #[test]
    fn node_with_project_signal_shows() {
        let metadata = ProjectMetadata {
            has_project_markers: true,
            ..ProjectMetadata::default()
        };
        assert!(is_dev_related(
            "node",
            &[3000],
            &[],
            &metadata,
            false,
            false
        ));
    }

    #[test]
    fn node_without_project_signal_is_hidden() {
        // This is the Discord case: node-based process, no project markers
        assert!(!is_dev_related(
            "node",
            &[6463],
            &[],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }

    #[test]
    fn discord_helper_is_rejected() {
        assert!(!is_dev_related(
            "Discord Helper (Renderer)",
            &[6463],
            &["/Applications/Discord.app/Contents/Frameworks/Discord Helper (Renderer).app".into()],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }

    #[test]
    fn python_http_server_shows_without_project_signal() {
        assert!(is_dev_related(
            "Python",
            &[4179],
            &[
                "python".into(),
                "-m".into(),
                "http.server".into(),
                "4179".into(),
            ],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }

    #[test]
    fn chrome_is_rejected_even_in_project_dir() {
        let metadata = ProjectMetadata {
            has_project_markers: true,
            ..ProjectMetadata::default()
        };
        assert!(!is_dev_related(
            "Google Chrome",
            &[55199],
            &["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into()],
            &metadata,
            false,
            false
        ));
    }

    #[test]
    fn project_path_named_like_desktop_app_does_not_hide_runtime() {
        let metadata = ProjectMetadata {
            has_project_markers: true,
            ..ProjectMetadata::default()
        };
        assert!(is_dev_related(
            "node",
            &[3000],
            &["/Users/me/projects/linear-admin/server.js".into()],
            &metadata,
            false,
            false
        ));
    }

    #[test]
    fn project_markers_alone_are_enough() {
        let metadata = ProjectMetadata {
            has_project_markers: true,
            ..ProjectMetadata::default()
        };
        assert!(is_dev_related("foo", &[22], &[], &metadata, false, false));
    }

    #[test]
    fn random_desktop_apps_are_not_included() {
        assert!(!is_dev_related(
            "ControlCenter",
            &[5000, 7000],
            &[],
            &ProjectMetadata::default(),
            false,
            false
        ));
    }
}
