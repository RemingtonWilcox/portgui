use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct ProjectMetadata {
    pub package_name: Option<String>,
    pub cargo_name: Option<String>,
    pub has_project_markers: bool,
    /// Parent directory name, used to qualify generic package names like "web" or "app"
    pub parent_dir_name: Option<String>,
}

/// Package names that are too generic to use alone — qualify with parent dir.
const GENERIC_PACKAGE_NAMES: &[&str] = &[
    "web", "app", "server", "client", "api", "frontend", "backend",
    "admin", "docs", "site", "www", "ui", "service", "worker",
];

const KNOWN_COMMANDS: &[(&[&str], &str)] = &[
    (&["next", "dev"], "Next.js Dev Server"),
    (&["next", "start"], "Next.js Server"),
    (&["wrangler", "dev"], "Wrangler Dev"),
    (&["astro", "dev"], "Astro Dev"),
    (&["convex", "dev"], "Convex Dev"),
    (&["vite", "dev"], "Vite Dev Server"),
    (&["vite"], "Vite Dev Server"),
    (&["nuxt", "dev"], "Nuxt Dev Server"),
    (&["remix", "dev"], "Remix Dev Server"),
    (&["gatsby", "develop"], "Gatsby Dev Server"),
    (&["webpack", "serve"], "Webpack Dev Server"),
    (&["cargo", "run"], "Cargo Run"),
    (&["go", "run"], "Go Run"),
    (&["flask", "run"], "Flask Dev Server"),
    (&["uvicorn"], "Uvicorn Server"),
    (&["rails", "server"], "Rails Server"),
    (&["hugo", "server"], "Hugo Dev Server"),
];
const PROJECT_MARKERS: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    ".git",
];

pub fn inspect_project(cwd: Option<&str>) -> ProjectMetadata {
    let Some(cwd) = cwd else {
        return ProjectMetadata::default();
    };

    let cwd_path = Path::new(cwd);
    let mut candidates = vec![PathBuf::from(cwd)];
    if let Some(parent) = cwd_path.parent() {
        candidates.push(parent.to_path_buf());
    }

    // Walk up to find a meaningful parent project name (for monorepo context)
    let parent_dir_name = find_root_project_name(cwd_path);

    for candidate in candidates {
        let mut metadata = ProjectMetadata::default();
        metadata.package_name = read_package_json_name(&candidate);
        metadata.cargo_name = read_cargo_toml_name(&candidate);
        metadata.has_project_markers = PROJECT_MARKERS
            .iter()
            .any(|name| candidate.join(name).exists());
        metadata.parent_dir_name = parent_dir_name.clone();

        if metadata.package_name.is_some()
            || metadata.cargo_name.is_some()
            || metadata.has_project_markers
        {
            return metadata;
        }
    }

    ProjectMetadata::default()
}

/// Walk up from cwd looking for a root package.json with a non-generic name.
/// Returns the first non-generic package name found in an ancestor directory.
fn find_root_project_name(start: &Path) -> Option<String> {
    let mut current = start.parent()?;
    for _ in 0..5 {
        if let Some(name) = read_package_json_name(current) {
            if !GENERIC_PACKAGE_NAMES.contains(&name.to_lowercase().as_str()) {
                return Some(name);
            }
        }
        if let Some(name) = read_cargo_toml_name(current) {
            if !GENERIC_PACKAGE_NAMES.contains(&name.to_lowercase().as_str()) {
                return Some(name);
            }
        }
        current = current.parent()?;
    }
    None
}

pub fn derive_display_name(
    cmd: &[String],
    project: &ProjectMetadata,
    process_name: &str,
    primary_port: u16,
) -> String {
    if let Some(name) = project.package_name.as_deref() {
        let is_generic = GENERIC_PACKAGE_NAMES.contains(&name.to_lowercase().as_str());
        if is_generic {
            // Qualify with parent project name: "Workspace App / Web"
            if let Some(parent) = project.parent_dir_name.as_deref() {
                return format!("{} / {}", titlecase(parent), titlecase(name));
            }
        }
        // Scoped packages: "@acme/web" -> "Acme Web"
        let clean = name.trim_start_matches('@').replace('/', " ");
        return titlecase(&clean);
    }

    if let Some(name) = project.cargo_name.as_deref() {
        return titlecase(name);
    }

    let cmd_lower: Vec<String> = cmd
        .iter()
        .map(|segment| {
            Path::new(segment)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(segment)
                .to_lowercase()
        })
        .collect();

    for (pattern, label) in KNOWN_COMMANDS {
        if matches_pattern(&cmd_lower, pattern) {
            return (*label).to_string();
        }
    }

    format!("{} on :{primary_port}", titlecase(process_name))
}

fn matches_pattern(cmd: &[String], pattern: &[&str]) -> bool {
    if pattern.is_empty() || cmd.is_empty() {
        return false;
    }

    for window in cmd.windows(pattern.len()) {
        if window
            .iter()
            .zip(pattern.iter())
            .all(|(segment, pattern)| segment.contains(pattern))
        {
            return true;
        }
    }

    pattern.len() == 1 && cmd.iter().any(|segment| segment.contains(pattern[0]))
}

fn read_package_json_name(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path.join("package.json")).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;
    json.get("name")?.as_str().map(|value| value.to_string())
}

fn read_cargo_toml_name(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path.join("Cargo.toml")).ok()?;
    let mut in_package = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "[package]" {
            in_package = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_package = false;
        }
        if in_package && trimmed.starts_with("name") {
            return trimmed
                .split_once('=')
                .map(|(_, value)| value.trim().trim_matches('"').to_string());
        }
    }

    None
}

fn titlecase(input: &str) -> String {
    input
        .split(['-', '_', ' '])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => {
                    let mut title = first.to_uppercase().to_string();
                    title.push_str(&chars.as_str().to_lowercase());
                    title
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn inspect_project_reads_package_json() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package.json"), r#"{"name":"acme-app"}"#).unwrap();
        let metadata = inspect_project(dir.path().to_str());
        assert_eq!(metadata.package_name.as_deref(), Some("acme-app"));
    }

    #[test]
    fn derive_display_name_prefers_known_package_name() {
        let metadata = ProjectMetadata {
            package_name: Some("acme-app".into()),
            ..ProjectMetadata::default()
        };
        let name = derive_display_name(&[], &metadata, "node", 3000);
        assert_eq!(name, "Acme App");
    }

    #[test]
    fn derive_display_name_matches_known_command_pattern() {
        let metadata = ProjectMetadata::default();
        let cmd = vec!["/usr/local/bin/pnpm".into(), "next".into(), "dev".into()];
        let name = derive_display_name(&cmd, &metadata, "node", 3000);
        assert_eq!(name, "Next.js Dev Server");
    }

    #[test]
    fn derive_display_name_falls_back_to_process_name() {
        let metadata = ProjectMetadata::default();
        let name = derive_display_name(&[], &metadata, "postgres", 5432);
        assert_eq!(name, "Postgres on :5432");
    }

    #[test]
    fn inspect_project_detects_additional_project_markers() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("Gemfile"), "source 'https://rubygems.org'").unwrap();
        let metadata = inspect_project(dir.path().to_str());
        assert!(metadata.has_project_markers);
    }

    #[test]
    fn generic_package_name_qualified_with_parent() {
        let metadata = ProjectMetadata {
            package_name: Some("web".into()),
            parent_dir_name: Some("workspace-app".into()),
            ..ProjectMetadata::default()
        };
        let name = derive_display_name(&[], &metadata, "node", 3000);
        assert_eq!(name, "Workspace App / Web");
    }

    #[test]
    fn generic_package_name_without_parent_still_works() {
        let metadata = ProjectMetadata {
            package_name: Some("web".into()),
            parent_dir_name: None,
            ..ProjectMetadata::default()
        };
        let name = derive_display_name(&[], &metadata, "node", 3000);
        assert_eq!(name, "Web");
    }

    #[test]
    fn scoped_package_name_cleaned() {
        let metadata = ProjectMetadata {
            package_name: Some("@acme/web".into()),
            ..ProjectMetadata::default()
        };
        let name = derive_display_name(&[], &metadata, "node", 3000);
        assert_eq!(name, "Acme Web");
    }
}
