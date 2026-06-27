export function canEditDriverBoardRow(options: {
  editorRole?: string | null;
  editorUserId?: string | null;
  sectionDispatcherId: string | null;
  groupByDispatcher: boolean;
}): boolean {
  const { editorRole, editorUserId } = options;

  if (editorRole === "admin") return true;
  if (editorRole === "dispatcher" && editorUserId) return true;
  return false;
}
