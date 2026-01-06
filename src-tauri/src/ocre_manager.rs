use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use strsim::normalized_levenshtein;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

/// Monster from Metamob API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Monster {
    pub id: i32,
    pub nom: String,
    pub slug: String,
    #[serde(rename = "type")]
    pub monster_type: String, // "monstre", "archimonstre", "boss"
    pub image_url: String,
    pub etape: i32,
    pub zone: String,
    pub souszone: String,
    #[serde(default)]
    pub nom_normal: Option<String>, // For archimonstres only
}

/// User's monster progress (local storage)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonsterProgress {
    pub id: i32,
    pub quantite: i32,
    #[serde(default)]
    pub captured_dates: Vec<String>, // History of capture dates
}

/// Complete user data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcreData {
    pub monsters: Vec<Monster>,           // Full monster list from Metamob
    pub progress: HashMap<i32, MonsterProgress>, // User's progress
    pub last_sync: Option<String>,        // Last sync date with Metamob
    pub api_key: Option<String>,          // Metamob API key (optional, for sync)
}

impl Default for OcreData {
    fn default() -> Self {
        Self {
            monsters: Vec::new(),
            progress: HashMap::new(),
            last_sync: None,
            api_key: None,
        }
    }
}

/// Result of OCR capture
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureResult {
    pub captured_text: Vec<String>,
    pub matched_monsters: Vec<MatchedMonster>,
    pub unmatched_text: Vec<String>,
}

/// A matched monster from OCR
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedMonster {
    pub monster: Monster,
    pub captured_text: String,
    pub confidence: f64, // 0.0 to 1.0
    pub already_owned: i32,
    pub new_quantity: i32,
}

// ============================================================================
// OCRE MANAGER
// ============================================================================

pub struct OcreManager {
    data_path: PathBuf,
    data: OcreData,
}

impl OcreManager {
    /// Create a new OcreManager and load existing data
    pub fn new() -> Result<Self> {
        let data_path = Self::get_data_path()?;
        let data = Self::load_data(&data_path).unwrap_or_default();

        Ok(Self { data_path, data })
    }

    /// Get the data file path
    fn get_data_path() -> Result<PathBuf> {
        let mut path = dirs::config_dir()
            .context("Failed to get config directory")?;
        path.push("Organizer 2.0");
        path.push("ocre_data.json");
        Ok(path)
    }

    /// Load data from disk
    fn load_data(path: &PathBuf) -> Result<OcreData> {
        if !path.exists() {
            return Ok(OcreData::default());
        }
        let json = fs::read_to_string(path)?;
        let data: OcreData = serde_json::from_str(&json)?;
        Ok(data)
    }

    /// Save data to disk
    pub fn save_data(&self) -> Result<()> {
        // Ensure directory exists
        if let Some(parent) = self.data_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(&self.data)?;
        fs::write(&self.data_path, json)?;
        Ok(())
    }

    /// Fetch monster list from Metamob API
    pub fn fetch_monsters_from_api(&mut self, api_key: &str) -> Result<usize> {
        println!("[OcreManager] Fetching monsters from Metamob API...");

        let client = reqwest::blocking::Client::new();
        let response = client
            .get("https://api.metamob.fr/monstres")
            .header("HTTP-X-APIKEY", api_key)
            .send()
            .context("Failed to call Metamob API")?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!(
                "Metamob API error: {} - {}",
                response.status(),
                response.text().unwrap_or_default()
            ));
        }

        let monsters: Vec<Monster> = response.json()
            .context("Failed to parse monster list from API")?;

        let count = monsters.len();
        println!("[OcreManager] Fetched {} monsters from Metamob", count);

        self.data.monsters = monsters;
        self.data.api_key = Some(api_key.to_string());
        self.data.last_sync = Some(chrono_now());

        self.save_data()?;

        Ok(count)
    }

    /// Get all monsters
    pub fn get_monsters(&self) -> &Vec<Monster> {
        &self.data.monsters
    }

    /// Get monsters filtered by type
    pub fn get_monsters_by_type(&self, monster_type: &str) -> Vec<&Monster> {
        self.data.monsters
            .iter()
            .filter(|m| m.monster_type == monster_type)
            .collect()
    }

    /// Get user's progress
    pub fn get_progress(&self) -> &HashMap<i32, MonsterProgress> {
        &self.data.progress
    }

    /// Get quantity for a specific monster
    pub fn get_monster_quantity(&self, monster_id: i32) -> i32 {
        self.data.progress
            .get(&monster_id)
            .map(|p| p.quantite)
            .unwrap_or(0)
    }

    /// Add quantity to a monster
    pub fn add_monster_quantity(&mut self, monster_id: i32, amount: i32) -> Result<i32> {
        let progress = self.data.progress
            .entry(monster_id)
            .or_insert(MonsterProgress {
                id: monster_id,
                quantite: 0,
                captured_dates: Vec::new(),
            });

        progress.quantite += amount;
        progress.captured_dates.push(chrono_now());

        let new_qty = progress.quantite;
        self.save_data()?;

        Ok(new_qty)
    }

    /// Set quantity for a monster
    pub fn set_monster_quantity(&mut self, monster_id: i32, quantity: i32) -> Result<()> {
        let progress = self.data.progress
            .entry(monster_id)
            .or_insert(MonsterProgress {
                id: monster_id,
                quantite: 0,
                captured_dates: Vec::new(),
            });

        progress.quantite = quantity;
        self.save_data()?;

        Ok(())
    }

    /// Find monster by name with fuzzy matching
    pub fn find_monster_by_name(&self, name: &str, min_confidence: f64) -> Option<(&Monster, f64)> {
        let name_lower = name.to_lowercase().trim().to_string();

        let mut best_match: Option<(&Monster, f64)> = None;

        for monster in &self.data.monsters {
            // Try exact match first
            let monster_name_lower = monster.nom.to_lowercase();
            if monster_name_lower == name_lower {
                return Some((monster, 1.0));
            }

            // Try fuzzy match
            let similarity = normalized_levenshtein(&name_lower, &monster_name_lower);

            // Also check nom_normal for archimonstres
            let alt_similarity = monster.nom_normal
                .as_ref()
                .map(|n| normalized_levenshtein(&name_lower, &n.to_lowercase()))
                .unwrap_or(0.0);

            let max_similarity = similarity.max(alt_similarity);

            if max_similarity >= min_confidence {
                if best_match.is_none() || max_similarity > best_match.unwrap().1 {
                    best_match = Some((monster, max_similarity));
                }
            }
        }

        best_match
    }

    /// Parse a line in the format "Nom du monstre (niveau)" and extract the name
    /// Handles various formats:
    /// - "Bwork Archer (37)" -> "Bwork Archer"
    /// - "Bwormage le Respectueux (44)" -> "Bwormage le Respectueux"
    /// - "Bonus de récompenses : +68%" -> None (filtered out)
    fn parse_monster_line(line: &str) -> Option<String> {
        let trimmed = line.trim();

        // Skip empty lines
        if trimmed.is_empty() {
            return None;
        }

        // Skip non-monster lines (bonus, headers, etc.)
        let skip_patterns = [
            "bonus de",
            "récompense",
            "effets",
            "poids",
            "prix",
            "niveau",
            "pierre d'âme",
            "archimonstre :",
            "cette pierre",
        ];

        let lower = trimmed.to_lowercase();
        for pattern in &skip_patterns {
            if lower.contains(pattern) {
                return None;
            }
        }

        // Try to extract name from "Nom (niveau)" format
        if let Some(paren_pos) = trimmed.rfind('(') {
            // Check if there's a closing parenthesis with a number inside
            if let Some(close_pos) = trimmed.rfind(')') {
                if close_pos > paren_pos {
                    let inside = &trimmed[paren_pos + 1..close_pos];
                    // Verify it's a number (level)
                    if inside.trim().parse::<i32>().is_ok() {
                        let name = trimmed[..paren_pos].trim();
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }

        // If no (niveau) format, return the whole line as potential monster name
        // but only if it looks like a valid name (not too short, no special chars)
        if trimmed.len() >= 3 && !trimmed.contains(':') && !trimmed.contains('%') {
            return Some(trimmed.to_string());
        }

        None
    }

    /// Process captured text and match to monsters
    pub fn process_captured_text(&mut self, lines: Vec<String>, min_confidence: f64) -> Result<CaptureResult> {
        let mut matched_monsters = Vec::new();
        let mut unmatched_text = Vec::new();

        for line in &lines {
            // Parse the line to extract monster name
            let monster_name = match Self::parse_monster_line(line) {
                Some(name) => name,
                None => continue, // Skip non-monster lines
            };

            match self.find_monster_by_name(&monster_name, min_confidence) {
                Some((monster, confidence)) => {
                    let already_owned = self.get_monster_quantity(monster.id);
                    let new_quantity = already_owned + 1;

                    // Add +1 to the monster
                    self.add_monster_quantity(monster.id, 1)?;

                    matched_monsters.push(MatchedMonster {
                        monster: monster.clone(),
                        captured_text: monster_name,
                        confidence,
                        already_owned,
                        new_quantity,
                    });
                }
                None => {
                    unmatched_text.push(monster_name);
                }
            }
        }

        Ok(CaptureResult {
            captured_text: lines,
            matched_monsters,
            unmatched_text,
        })
    }

    /// Get statistics
    pub fn get_statistics(&self) -> OcreStatistics {
        let total_monsters = self.data.monsters.len();
        let total_archimonstres = self.data.monsters
            .iter()
            .filter(|m| m.monster_type == "archimonstre")
            .count();
        let total_monstres = self.data.monsters
            .iter()
            .filter(|m| m.monster_type == "monstre")
            .count();

        let captured_archimonstres = self.data.monsters
            .iter()
            .filter(|m| m.monster_type == "archimonstre")
            .filter(|m| self.get_monster_quantity(m.id) > 0)
            .count();

        let captured_monstres = self.data.monsters
            .iter()
            .filter(|m| m.monster_type == "monstre")
            .filter(|m| self.get_monster_quantity(m.id) > 0)
            .count();

        OcreStatistics {
            total_monsters,
            total_archimonstres,
            total_monstres,
            captured_archimonstres,
            captured_monstres,
            progress_archimonstres: if total_archimonstres > 0 {
                (captured_archimonstres as f64 / total_archimonstres as f64) * 100.0
            } else {
                0.0
            },
            progress_monstres: if total_monstres > 0 {
                (captured_monstres as f64 / total_monstres as f64) * 100.0
            } else {
                0.0
            },
        }
    }

    /// Reset all progress
    pub fn reset_progress(&mut self) -> Result<()> {
        self.data.progress.clear();
        self.save_data()?;
        Ok(())
    }

    /// Export progress to JSON
    pub fn export_progress(&self) -> Result<String> {
        serde_json::to_string_pretty(&self.data.progress)
            .context("Failed to export progress")
    }

    /// Import progress from JSON
    pub fn import_progress(&mut self, json: &str) -> Result<usize> {
        let progress: HashMap<i32, MonsterProgress> = serde_json::from_str(json)
            .context("Failed to parse progress JSON")?;
        let count = progress.len();
        self.data.progress = progress;
        self.save_data()?;
        Ok(count)
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcreStatistics {
    pub total_monsters: usize,
    pub total_archimonstres: usize,
    pub total_monstres: usize,
    pub captured_archimonstres: usize,
    pub captured_monstres: usize,
    pub progress_archimonstres: f64,
    pub progress_monstres: f64,
}

// ============================================================================
// HELPERS
// ============================================================================

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    format!("{}", duration.as_secs())
}

// Support for dirs crate
mod dirs {
    use std::path::PathBuf;

    pub fn config_dir() -> Option<PathBuf> {
        std::env::var("APPDATA")
            .ok()
            .map(PathBuf::from)
    }
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_matching() {
        let manager = OcreManager::new().unwrap();
        // This will only work if monsters are loaded
        println!("Loaded {} monsters", manager.get_monsters().len());
    }
}
