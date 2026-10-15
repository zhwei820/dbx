use std::path::{Path, PathBuf};
use std::sync::Mutex;

// Keep in sync with the "Spreadsheet" entry of bundle.fileAssociations in tauri.conf.json.
const SPREADSHEET_EXTENSIONS: &[&str] = &["xlsx", "xlsm", "xls", "csv", "tsv"];

#[derive(Default)]
pub struct ExternalSpreadsheetOpenState {
    pending: Mutex<Vec<String>>,
}

impl ExternalSpreadsheetOpenState {
    pub fn push(&self, paths: Vec<String>) {
        if paths.is_empty() {
            return;
        }
        if let Ok(mut pending) = self.pending.lock() {
            pending.extend(paths);
        }
    }

    fn drain(&self) -> Vec<String> {
        self.pending.lock().map(|mut pending| pending.drain(..).collect()).unwrap_or_default()
    }
}

#[tauri::command]
pub fn pending_open_spreadsheet_files(state: tauri::State<'_, ExternalSpreadsheetOpenState>) -> Vec<String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut paths = spreadsheet_file_paths_from_args(std::env::args().skip(1), &cwd);
    paths.extend(state.drain());
    dedupe_paths(paths)
}

pub fn spreadsheet_file_paths_from_args<I, S>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().filter_map(|arg| spreadsheet_file_path_from_arg(arg.as_ref(), cwd)).collect()
}

fn spreadsheet_file_path_from_arg(arg: &str, cwd: &Path) -> Option<String> {
    if arg.starts_with('-') {
        return None;
    }

    let path = PathBuf::from(super::launch_args::normalize_launch_path_arg(arg)?);
    if !is_spreadsheet_file_path(&path) {
        return None;
    }

    let resolved = if path.is_absolute() { path } else { cwd.join(path) };
    Some(resolved.to_string_lossy().to_string())
}

pub fn is_spreadsheet_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| SPREADSHEET_EXTENSIONS.iter().any(|e| e.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut unique = Vec::new();
    for path in paths {
        if !unique.contains(&path) {
            unique.push(path);
        }
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_spreadsheet_args_case_insensitively() {
        let paths = spreadsheet_file_paths_from_args(
            [
                "/tmp/a.xlsx",
                "--flag",
                "/tmp/b.XLS",
                "/tmp/c.csv",
                "/tmp/d.tsv",
                "/tmp/e.xlsm",
                "/tmp/f.sql",
                "/tmp/g.db",
            ],
            Path::new("/work"),
        );

        assert_eq!(paths, vec!["/tmp/a.xlsx", "/tmp/b.XLS", "/tmp/c.csv", "/tmp/d.tsv", "/tmp/e.xlsm"]);
    }

    #[test]
    fn resolves_relative_spreadsheet_args_against_cwd() {
        let paths = spreadsheet_file_paths_from_args(["data/report.xlsx"], Path::new("/work"));

        assert_eq!(paths, vec!["/work/data/report.xlsx"]);
    }

    #[test]
    fn accepts_spreadsheet_args_passed_as_file_urls() {
        let paths = spreadsheet_file_paths_from_args(["file:///tmp/my%20data.csv"], Path::new("/work"));

        assert_eq!(paths, vec!["/tmp/my data.csv"]);
    }

    #[test]
    fn drains_pending_spreadsheet_paths_once() {
        let state = ExternalSpreadsheetOpenState::default();
        state.push(vec!["/tmp/a.csv".to_string()]);

        assert_eq!(state.drain(), vec!["/tmp/a.csv"]);
        assert!(state.drain().is_empty());
    }
}
