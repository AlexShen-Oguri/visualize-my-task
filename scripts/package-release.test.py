"""Exercise the real release packager against an isolated, synthetic checkout."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]


class ReleasePackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='visualize-my-task-package-test-')
        self.addCleanup(self.temporary.cleanup)
        self.checkout = Path(self.temporary.name) / 'checkout'
        self.checkout.mkdir()
        for line in (ROOT / '.gitignore').read_text().splitlines():
            if line.startswith('!/') and not line.endswith('/'):
                relative = line[2:]
                destination = self.checkout / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / relative, destination)
        self.archive = self.checkout / 'dist/visualize-my-task-1.0.0.zip'

    def package(self):
        result = subprocess.run(
            [sys.executable, str(self.checkout / 'scripts/package-release.py')],
            cwd=self.checkout, capture_output=True, text=True, timeout=120,
        )
        summary = self.checkout / 'dist/visualize-my-task-1.0.0.json'
        if summary.exists():
            extraction = Path(json.loads(summary.read_text())['extraction']).parent
            self.addCleanup(shutil.rmtree, extraction, ignore_errors=True)
        return result

    def test_unlisted_private_files_are_excluded_from_verified_package(self):
        assets = self.checkout / 'visualize-my-task/assets'
        (assets / 'private-notes.md').write_text('Synthetic private development note.\n')
        (assets / 'secret.env').write_text('SYNTHETIC_SECRET=do-not-package\n')
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with zipfile.ZipFile(self.archive) as bundle:
            names = bundle.namelist()
        self.assertNotIn('visualize-my-task/assets/private-notes.md', names)
        self.assertNotIn('visualize-my-task/assets/secret.env', names)
        self.assertEqual(len(names), 49)
        summary = json.loads((self.checkout / 'dist/visualize-my-task-1.0.0.json').read_text())
        self.assertEqual(summary['files'], 49)
        self.assertGreater(summary['packagedTests'], 0)
        self.assertEqual(summary['failures'], 0)
        self.assertEqual(len(summary['cases']), 12)

    def test_allowlisted_symlink_is_rejected_before_writing_archive(self):
        outside = Path(self.temporary.name) / 'private-note.txt'
        outside.write_text('Synthetic text outside the release checkout.\n')
        selected = self.checkout / 'visualize-my-task/assets/OFL-BarlowCondensed.txt'
        selected.unlink()
        selected.symlink_to(outside)
        result = self.package()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.archive.exists(), 'The packager wrote an archive before rejecting a symlink.')

    def test_missing_allowlisted_file_is_rejected_before_writing_archive(self):
        (self.checkout / 'visualize-my-task/assets/terrain.png').unlink()
        result = self.package()
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.archive.exists(), 'The packager wrote an archive before rejecting a missing file.')


if __name__ == '__main__':
    unittest.main()
