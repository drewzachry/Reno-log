/**
 * The app's name, as in the dashboard's header: a small spaced-out label over
 * the project's name. Without a project (sign-in, invites) it's just the name.
 */
export function Brand({ project }: { project?: string }) {
  if (!project) {
    return <div className="text-[19px] leading-tight font-bold tracking-[-.5px]">Reno Logbook</div>;
  }
  return (
    <div className="min-w-0">
      <div className="text-header-muted text-[10px] font-semibold tracking-[3px] uppercase">
        Reno Logbook
      </div>
      <div className="truncate text-[19px] leading-tight font-bold tracking-[-.5px]">{project}</div>
    </div>
  );
}
