import qrcode from "qrcode"; // QRコード画像を生成するライブラリ
import invariant from "tiny-invariant"; // 条件が満たされない場合にエラーを投げるユーティリティ
import db from "../db.server"; // データベース接続（Prismaなどを想定）

// 指定されたIDのQRコード情報をデータベースから取得し、補足情報を追加して返す
export async function getQRCode(id, graphql) {
  const qrCode = await db.qRCode.findFirst({ where: { id } });

  if (!qrCode) {
    return null;
  }

  return supplementQRCode(qrCode, graphql);
}

// 指定されたShopのすべてのQRコードを取得し、それぞれに補足情報を付けて返す
export async function getQRCodes(shop, graphql) {
  const qrCodes = await db.qRCode.findMany({
    where: { shop },
    orderBy: { id: "desc" }, // 新しい順に並べる
  });

  if (qrCodes.length === 0) return [];

  // それぞれのQRコードに商品情報や画像などを補完する
  return Promise.all(
    qrCodes.map((qrCode) => supplementQRCode(qrCode, graphql)),
  );
}

// QRコード画像を生成し、DataURL形式で返す（画面表示やimg要素で使える）
export function getQRCodeImage(id) {
  const url = new URL(`/qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
  return qrcode.toDataURL(url.href); // 例: data:image/png;base64,...
}

// QRコードのリンク先URLを生成（商品ページ or カートに直接追加）
export function getDestinationUrl(qrCode) {
  if (qrCode.destination === "product") {
    // 商品ページへのリンク
    return `https://${qrCode.shop}/products/${qrCode.productHandle}`;
  }

  // カート追加リンクを作成するために、バリアントIDを抽出
  const match = /gid:\/\/shopify\/ProductVariant\/([0-9]+)/.exec(
    qrCode.productVariantId,
  );
  invariant(match, "Unrecognized product variant ID"); // エラーがあれば停止

  // カートURLを返す（例: /cart/123456789:1 → 1個追加済み）
  return `https://${qrCode.shop}/cart/${match[1]}:1`;
}

// QRコードに対応する商品情報（タイトル・画像）とQRコード画像・遷移先URLを補完
async function supplementQRCode(qrCode, graphql) {
  const qrCodeImagePromise = getQRCodeImage(qrCode.id); // 画像生成を並行して実行

  // ShopifyのGraphQL APIを使って、商品情報を取得
  const response = await graphql(
    `
      query supplementQRCode($id: ID!) {
        product(id: $id) {
          title
          images(first: 1) {
            nodes {
              altText
              url
            }
          }
        }
      }
    `,
    {
      variables: {
        id: qrCode.productId,
      },
    },
  );

  const {
    data: { product },
  } = await response.json();

  return {
    ...qrCode,
    productDeleted: !product?.title, // 商品が削除されていればtrue
    productTitle: product?.title,
    productImage: product?.images?.nodes[0]?.url,
    productAlt: product?.images?.nodes[0]?.altText,
    destinationUrl: getDestinationUrl(qrCode),
    image: await qrCodeImagePromise, // QRコード画像（DataURL）
  };
}

// QRコード作成時のバリデーション（未入力項目がある場合、エラーを返す）
export function validateQRCode(data) {
  const errors = {};

  if (!data.title) {
    errors.title = "Title is required";
  }

  if (!data.productId) {
    errors.productId = "Product is required";
  }

  if (!data.destination) {
    errors.destination = "Destination is required";
  }

  // エラーが1つでもあれば返す（なければundefined）
  if (Object.keys(errors).length) {
    return errors;
  }
}
