import { EditorScreen } from '@/widgets/editor/editor-screen';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  return <EditorScreen cardId={cardId} />;
}
