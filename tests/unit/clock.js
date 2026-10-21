// Pins the system time to 2026-01-01 before any src/ module loads (imports only vitest).
import { vi } from 'vitest';

vi.setSystemTime(new Date(2026, 0, 1));
