# BananaForge 0.3.35

## Fix self-update handoff on Windows

- Fixes `spawn ENAMETOOLONG` by launching the verified PowerShell progress window from a temporary UTF-8 script file instead of embedding the full script in the Windows command line.
- Removes the temporary helper script after the update window closes and cleans it up when PowerShell cannot start.
- Keeps BananaForge open and reports a clear error if the update helper fails to start.
