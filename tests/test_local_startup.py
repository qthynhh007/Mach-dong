"""A source checkout must start the local backend, not the older hosted API."""

import os
import runpy
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from src.main import app


class LocalStartupTests(TestCase):
    def test_default_launcher_needs_neither_node_nor_provider_key(self):
        execute = runpy.run_path
        entry = Path(__file__).resolve().parents[1] / "scripts" / "run-local.py"
        with patch.dict(os.environ, {}, clear=True), patch("dotenv.load_dotenv"), patch("runpy.run_path") as shared, patch("subprocess.run") as node:
            with self.assertRaises(SystemExit) as result:
                execute(str(entry), run_name="__main__")
        self.assertEqual(result.exception.code, 0)
        shared.assert_called_once_with(str(entry.with_name("run-shared.py")), run_name="__main__")
        node.assert_not_called()

    def test_python_main_starts_complete_local_app_by_default(self):
        entry = Path(__file__).resolve().parents[1] / "main.py"
        with patch.dict(os.environ, {}, clear=True), patch("runpy.run_path") as launch, patch.object(app, "run"):
            runpy.run_module("main", run_name="__main__")
        launch.assert_called_once_with(str(entry.parent / "scripts" / "run-local.py"), run_name="__main__")

    def test_explicit_cloud_mode_keeps_the_hosted_entry_point(self):
        with patch.dict(os.environ, {"MACH_DONG_USE_CLOUD": "1"}), patch("runpy.run_path") as launch, patch.object(app, "run") as run:
            runpy.run_module("main", run_name="__main__")
        launch.assert_not_called()
        run.assert_called_once_with()
