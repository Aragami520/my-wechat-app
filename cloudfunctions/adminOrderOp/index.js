// cloudfunctions/adminOrderOp/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MY_MCH_ID = '1103958926' // 您的商户号

exports.main = async (event, context) => {
  const { action, orderId, refundReason, expressNo } = event
  console.log(`[调试] 执行操作: ${action}, ID: ${orderId}`)

  try {
    // === 功能1: 申请退款 ===
    if (action === 'apply_refund') {
      const orderRes = await db.collection('orders').doc(orderId).get()
      const status = orderRes.data.status || 'PAID'
      if (status === 'REFUNDING' || status === 'REFUNDED') return { code: -1, msg: '请勿重复提交' }
      await db.collection('orders').doc(orderId).update({ data: { status: 'REFUNDING', applyRefundTime: db.serverDate() } })
      return { code: 0, msg: '申请已提交' }
    }

    // === 功能2: 商家退款 (含强制清理逻辑) ===
    if (action === 'refund') {
      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data
      if (order.status === 'REFUNDED') return { code: -1, msg: '已退款' }

      // 1. 找金额
      let rawFee = order.totalFee || order.price || order.total_fee || order.money || order.cashFee;
      let refundFee = Math.round(Number(rawFee || 0) * (String(rawFee).includes('.') ? 100 : 1));

      // 2. 找订单号 (关键！)
      const tradeNo = order.out_trade_no || order.outTradeNo || order.tradeId;
      const transactionId = order.transaction_id || order.transactionId;

      // 🛑【新增逻辑】如果是“脏数据”（没单号），直接强制改状态，不调微信接口
      if (!tradeNo && !transactionId) {
        console.log('⚠️ 发现缺失订单号的旧数据，执行强制本地退款');
        await db.collection('orders').doc(orderId).update({
          data: { status: 'REFUNDED', refundReason: '旧订单强制清理' }
        })
        return { code: 0, msg: '无单号订单，已强制标记为退款' }
      }

      // 正常退款流程
      const refundData = {
        "sub_mch_id": MY_MCH_ID,
        "out_refund_no": "REF_" + (tradeNo || orderId),
        "total_fee": refundFee,
        "refund_fee": refundFee,
        "nonce_str": "" + new Date().getTime(),
        "env_id": cloud.DYNAMIC_CURRENT_ENV 
      };
      if (transactionId) refundData.transaction_id = transactionId;
      else refundData.out_trade_no = tradeNo;

      const res = await cloud.cloudPay.refund(refundData)
      
      if (res.returnCode === 'SUCCESS' && res.resultCode === 'SUCCESS') {
        await db.collection('orders').doc(orderId).update({
          data: { status: 'REFUNDED', refundTime: db.serverDate() }
        })
        return { code: 0, msg: '退款成功' }
      } else {
        return { code: -1, msg: '微信拒绝: ' + (res.errCodeDes || res.returnMsg) }
      }
    }

    // === 功能3: 发货 ===
    if (action === 'ship') {
      await db.collection('orders').doc(orderId).update({
        data: { status: 'SHIPPED', expressNo: expressNo || '', shipTime: db.serverDate() }
      })
      return { code: 0, msg: '发货成功' }
    }

  } catch (err) { return { code: -2, msg: '报错: ' + err.message } }
}