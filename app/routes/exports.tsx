import { ExportsPanel } from "~/components/exports/ExportsPanel";
import { useParams } from "react-router";

export default function ExportsRoute() {
  const { id } = useParams<{ id: string }>();

  // This route is nested under /project/:id, so id should always exist
  if (!id) {
    throw new Error("Project ID is required");
  }

  return <ExportsPanel projectId={id} />;
}
