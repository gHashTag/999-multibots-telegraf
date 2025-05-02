---
description: 
globs: 
alwaysApply: false
---
# Debugging: Telegram Error 409 Conflict

## Problem

During development using `pnpm dev` (with `nodemon` and `tsx watch`), you might encounter persistent `TelegramError: 409: Conflict: terminated by other getUpdates request` errors, even after restarting the `pnpm dev` process. This indicates multiple bot instances are trying to connect to Telegram simultaneously.

## Cause

`nodemon` or the Node.js process manager might not always cleanly terminate old bot processes upon restart, leaving "zombie" instances running in the background. Simple restarts (`rs` in nodemon or Ctrl+C -> `pnpm dev`) may not be sufficient.

## Solution

1.  Stop the current `pnpm dev` process (`Ctrl+C`).
2.  **Forcefully kill all potentially related Node.js processes:**
    ```bash
    pkill -f node
    ```
    *Caution: This kills ALL Node.js processes. Use with care if other Node apps are running.*
    Alternatively, try a more specific command if you know the script path:
    ```bash
    pkill -f 'tsx watch src/bot.ts'
    ```
    (This specific command sometimes failed to find the process in past debugging).
3.  Check if `pm2` is managing any instances (unlikely in dev, but possible):
    ```bash
    pm2 list | cat
    pm2 delete all # If any relevant processes are found
    ```
4.  Start `pnpm dev` again.

**Key Takeaway:** If experiencing `409 Conflict` errors or unexpected behavior where code changes don't seem to apply, suspect lingering processes and use `pkill -f node` before restarting the development server.
