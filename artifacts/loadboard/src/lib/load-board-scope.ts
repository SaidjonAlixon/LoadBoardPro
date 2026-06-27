/** Request header — tells the API which board is editing a load. */
export const LOAD_BOARD_SCOPE_HEADER = "X-Load-Board-Scope";

export const LOAD_BOARD_SCOPE_SPREADSHEET = "spreadsheet";
export const LOAD_BOARD_SCOPE_STATUS = "statusboard";

export function spreadsheetLoadHeaders(): HeadersInit {
  return { [LOAD_BOARD_SCOPE_HEADER]: LOAD_BOARD_SCOPE_SPREADSHEET };
}

export function statusBoardLoadHeaders(): HeadersInit {
  return { [LOAD_BOARD_SCOPE_HEADER]: LOAD_BOARD_SCOPE_STATUS };
}
