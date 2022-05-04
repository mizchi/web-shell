export type AutoCompleteFunc = (
  input: {
    cursor: number,
    raw: string,
    args: string[],
  }
) => Promise<Array<string> | null>;