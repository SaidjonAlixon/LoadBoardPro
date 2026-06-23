export function canEditDriverBoardRow(options: {
  editorRole?: string | null;
  editorUserId?: string | null;
  sectionDispatcherId: string | null;
  groupByDispatcher: boolean;
}): boolean {
  const { editorRole, editorUserId, sectionDispatcherId, groupByDispatcher } = options;

  if (editorRole === "admin") return true;
  if (editorRole !== "dispatcher" || !editorUserId) return false;
  if (!groupByDispatcher) return true;
  if (sectionDispatcherId === null) return false;
  return sectionDispatcherId === editorUserId;
}
