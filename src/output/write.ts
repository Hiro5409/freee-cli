interface OutputStream {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
}

export function writeOutput(output: string, stdout: OutputStream = process.stdout): Promise<void> {
  return new Promise((resolve, reject) => {
    stdout.write(`${output}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
