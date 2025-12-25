// cloudfunctions/makeOrder/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  // 1. 生成一个唯一的商户订单号
  // 格式：corn_时间戳_随机数 (防止重复)
  const outTradeNo = "corn_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);

  const res = await cloud.cloudPay.unifiedOrder({
    "body": event.goodsName || "新鲜糯玉米",
    "outTradeNo": outTradeNo, // 使用刚才生成的单号
    "spbillCreateIp": "127.0.0.1",
    "subMchId": "1103958926", // 您的商户号
    "totalFee": event.totalFee || 1, // 金额(分)
    "envId": "cloud1-3gwzyszw481ccd3d", // 您的云环境ID
    "functionName": "payCb" // 支付回调云函数(暂时用不到，但也得填)
  })

  // 🛑 关键修复：一定要把 outTradeNo 返回给前端！
  // 之前可能只返回了 res，导致前端拿不到单号
  return {
    payment: res.payment, // 支付参数
    outTradeNo: outTradeNo // 商户单号 (前端存库要用！)
  }
}