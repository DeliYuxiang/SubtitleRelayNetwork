import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types";

export class BackupBucket {
  private client: AwsClient | null = null;
  private baseUrl = "";

  constructor(
    private env: Bindings,
    private ctx: ExecutionContext,
  ) {
    const { B2_KEY_ID, B2_APP_KEY, B2_ENDPOINT, B2_BUCKET_NAME, B2_REGION } =
      env;
    if (B2_KEY_ID && B2_APP_KEY && B2_ENDPOINT && B2_BUCKET_NAME) {
      this.client = new AwsClient({
        accessKeyId: B2_KEY_ID,
        secretAccessKey: B2_APP_KEY,
        service: "s3",
        region: B2_REGION ?? "us-west-004",
      });
      this.baseUrl = `${B2_ENDPOINT}/${B2_BUCKET_NAME}`;
    }
  }

  /** 写路径：新文件，直接写（已知 B2 没有，跳过 HEAD）。*/
  write(key: string, body: ArrayBuffer, contentType: string): void {
    if (!this.client) return;
    this.ctx.waitUntil(
      this._put(key, body, contentType).catch((err) =>
        console.error("[B2] write failed:", key, err),
      ),
    );
  }

  /** 读路径：旧数据懒迁移，存在则跳过，不存在则写入。*/
  checkExistsOrWrite(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): void {
    if (!this.client) return;
    this.ctx.waitUntil(
      this._head(key)
        .then((exists) => {
          if (!exists) return this._put(key, body, contentType);
        })
        .catch((err) => console.error("[B2] sync failed:", key, err)),
    );
  }

  private async _put(
    key: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const res = await this.client!.fetch(`${this.baseUrl}/${key}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": contentType, "Content-Encoding": "gzip" },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  }

  private async _head(key: string): Promise<boolean> {
    const res = await this.client!.fetch(`${this.baseUrl}/${key}`, {
      method: "HEAD",
    });
    return res.ok;
  }
}
