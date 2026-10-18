/** Stock changes invalidate this root; the dashboard queries arrive in Phase 5. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
};
