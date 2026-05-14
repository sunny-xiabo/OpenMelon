"""Compatibility wrapper for the log center domain router.

New log-center implementation lives under app.log_center. This module remains
so older imports keep working during the package boundary migration.
"""

from app.log_center.router import *  # noqa: F401,F403
