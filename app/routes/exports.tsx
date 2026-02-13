import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams } from "react-router";

export default function ExportsRoute() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <div>Project ID required</div>;
  }

  return <ExportsPanel projectId={projectId} />;
}
