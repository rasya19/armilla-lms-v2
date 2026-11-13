import { stdin, stdout } from "process";

export async function readPassword(): Promise<string> {
  if (!stdin.isTTY) throw new Error("Pembuatan akun harus dijalankan di terminal interaktif.");
  stdout.write("Kata sandi (minimal 6 karakter, tidak ditampilkan): ");
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.removeListener("error", onError);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") return finish(new Error("Dibatalkan."));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    const onEnd = () => finish(new Error("Input kata sandi terputus."));
    const onError = (error: Error) => finish(error);
    stdin.on("data", onData);
    stdin.once("end", onEnd);
    stdin.once("error", onError);
  });
}
