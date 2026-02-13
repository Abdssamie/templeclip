import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams, useOutletContext } from "react-router";

export default function ExportsRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const { exportsRefreshKey } = useOutletContext<{ exportsRefreshKey?: number }>();

  if (!projectId) {
    return <div>Project ID required</div>;
  }

  return <ExportsPanel key={exportsRefreshKey} projectId={projectId} />;
}
