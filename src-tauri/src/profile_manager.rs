use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::hotkey_manager::Hotkey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub window_order: Vec<String>, // Character names in order
    pub hotkeys: Vec<Hotkey>,
}

impl Profile {
    pub fn new(name: String) -> Self {
        Self {
            name,
            window_order: Vec::new(),
            hotkeys: Vec::new(),
        }
    }
}

pub struct ProfileManager {
    profiles_dir: PathBuf,
}

impl ProfileManager {
    pub fn new() -> Result<Self> {
        let profiles_dir = Self::get_profiles_directory()?;

        // Create profiles directory if it doesn't exist
        if !profiles_dir.exists() {
            fs::create_dir_all(&profiles_dir)
                .context("Failed to create profiles directory")?;
        }

        Ok(Self { profiles_dir })
    }

    /// Get the profiles directory path
    fn get_profiles_directory() -> Result<PathBuf> {
        let mut path = dirs::config_dir()
            .context("Failed to get config directory")?;
        path.push("Organizer 2.0");
        path.push("profiles");
        Ok(path)
    }

    /// Save a profile to disk
    pub fn save_profile(&self, profile: &Profile) -> Result<()> {
        let file_name = format!("{}.json", sanitize_filename(&profile.name));
        let file_path = self.profiles_dir.join(file_name);

        let json = serde_json::to_string_pretty(profile)
            .context("Failed to serialize profile")?;

        fs::write(&file_path, json)
            .context(format!("Failed to write profile to {:?}", file_path))?;

        Ok(())
    }

    /// Load a profile from disk
    pub fn load_profile(&self, name: &str) -> Result<Profile> {
        let file_name = format!("{}.json", sanitize_filename(name));
        let file_path = self.profiles_dir.join(file_name);

        let json = fs::read_to_string(&file_path)
            .context(format!("Failed to read profile from {:?}", file_path))?;

        let profile: Profile = serde_json::from_str(&json)
            .context("Failed to deserialize profile")?;

        Ok(profile)
    }

    /// List all available profiles
    pub fn list_profiles(&self) -> Result<Vec<String>> {
        let mut profiles = Vec::new();
        // Liste des profils temporaires à exclure
        let excluded_profiles = vec!["Current", "temp", "temporary"];

        if !self.profiles_dir.exists() {
            return Ok(profiles);
        }

        for entry in fs::read_dir(&self.profiles_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                    // Filtrer les profils temporaires
                    if !excluded_profiles.contains(&file_stem) {
                        profiles.push(file_stem.to_string());
                    }
                }
            }
        }

        Ok(profiles)
    }

    /// Delete a profile
    pub fn delete_profile(&self, name: &str) -> Result<()> {
        let file_name = format!("{}.json", sanitize_filename(name));
        let file_path = self.profiles_dir.join(file_name);

        fs::remove_file(&file_path)
            .context(format!("Failed to delete profile at {:?}", file_path))?;

        Ok(())
    }

    /// Get the path to the current profile (last used)
    pub fn get_current_profile_path(&self) -> PathBuf {
        self.profiles_dir.join("current.json")
    }

    /// Save the current profile (auto-save)
    pub fn save_current_profile(&self, profile: &Profile) -> Result<()> {
        let file_path = self.get_current_profile_path();

        let json = serde_json::to_string_pretty(profile)
            .context("Failed to serialize current profile")?;

        fs::write(&file_path, json)
            .context("Failed to write current profile")?;

        Ok(())
    }

    /// Load the current profile (auto-load on startup)
    pub fn load_current_profile(&self) -> Result<Option<Profile>> {
        let file_path = self.get_current_profile_path();

        if !file_path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(&file_path)
            .context("Failed to read current profile")?;

        let profile: Profile = serde_json::from_str(&json)
            .context("Failed to deserialize current profile")?;

        Ok(Some(profile))
    }
}

/// Sanitize a filename by removing invalid characters
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

// Add dirs crate support for getting config directory
mod dirs {
    use std::path::PathBuf;

    pub fn config_dir() -> Option<PathBuf> {
        std::env::var("APPDATA")
            .ok()
            .map(PathBuf::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("test/profile"), "test_profile");
        assert_eq!(sanitize_filename("my:profile*"), "my_profile_");
    }
}
