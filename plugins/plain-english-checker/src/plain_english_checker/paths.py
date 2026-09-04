"""Single source of truth for the plugin's live filesystem paths.

`LIVE_PATHS` is a shared, mutable singleton. Every path is a property computed
from `base_directory` at access time. Never snapshot `.wordlist_path` (etc.)
into a module-level constant, or overriding `base_directory` in a test will
silently miss that snapshot.
"""

from dataclasses import dataclass
from pathlib import Path


@dataclass
class PluginPaths:
    base_directory: Path

    @property
    def wordlist_path(self) -> Path:
        return self.base_directory / "banned-words.txt"

    @property
    def config_path(self) -> Path:
        return self.base_directory / "config.toml"

    @property
    def tracking_database_path(self) -> Path:
        return self.base_directory / "tracking.sqlite3"


LIVE_PATHS = PluginPaths(base_directory=Path.home() / ".claude" / "plain-english-checker")
