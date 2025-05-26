import qrcode from "qrcode";
import invariant from "tiny-invariant";
import db from "../db.server";
// 引数 id に対応する QRコードをデータベースから1件取り出す
export async function getQRcode(id, graphql) {
  const qrCode = await db.qrCode.findFirst({
    where: { id },
  });
  if (!qrCode) {
    return null;
  }
  // QRコードに対応する商品タイトルや画像情報などを補完して返す
  return supplementQRCode(qrCode, graphql);
}

// ある shop（ストア）にひもづいた 全QRコード一覧をデータベースから取得
export async function getQRcodes(shop, graphql) {
  const qrCodes = await db.qrCode.findMany({
    where: { shop },
    orderBy: {
      id: "desc",
    },
  });
  if (qrCodes.length === 0) {
    return [];
  }
  return Promise.all(
    // QRコードに対応する商品タイトルや画像情報などを補完して返す
    qrCodes.map((qrCode) => supplementQRCode(qrCode, graphql)),
  );
}

// QRコード画像を取得する
export function getQRcodeImage(id) {
  const url = new URL(`qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
  return qrcode.toDataURL(url.href);
}
