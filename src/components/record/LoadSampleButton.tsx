import { loadSampleProject } from "@/lib/actions/record";
import { ui } from "@/components/ui";

export function LoadSampleButton({ className = "" }: { className?: string }) {
  return (
    <form action={loadSampleProject} className={className}>
      <button className={`${ui.ghost} w-full`}>Explore a sample project</button>
    </form>
  );
}
