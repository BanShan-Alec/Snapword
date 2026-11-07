export interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveFileDialogResult {
  canceled: boolean;
  filePath?: string;
}
