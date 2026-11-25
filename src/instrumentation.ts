// Arranca el scheduler del publicador cuando inicia el servidor de Next.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./publisher/scheduler");
  startScheduler();
}
