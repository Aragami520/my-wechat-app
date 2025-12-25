// pages/order/index.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    orderList: [],
    isAdmin: false
  },

  onShow: function () {
    this.getMyOrders();
  },

  // pages/order/index.js

  // ... 其他函数 ...

  // ✨✨✨ 查看物流 (跳转到快递100) ✨✨✨
  viewLogistics(e) {
    const no = e.currentTarget.dataset.no;
    if (!no) return;

    wx.navigateToMiniProgram({
      appId: 'wx6885acbedba59a14', // 快递100的小程序AppID
      path: `pages/result/result?nu=${no}`, // 直接把单号传过去
      success(res) {
        // 打开成功
      },
      fail(err) {
        // 如果用户拒绝跳转，或者报错
        console.error(err);
        wx.showToast({ title: '无法打开物流页', icon: 'none' });
      }
    });
  },
  
  // ... 其他函数 ...

  // 获取订单
  getMyOrders() {
    wx.showLoading({ title: '加载中...' });
    db.collection('orders')
      .where({
        _openid: '{openid}', 
        isDeletedByUser: _.neq(true) // 过滤掉已删除的
      })
      .orderBy('createTime', 'desc')
      .get({
        success: res => {
          wx.hideLoading();
          const list = res.data.map(item => {
            const d = new Date(item.createTime);
            item.timeStr = `${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
            return item;
          });
          this.setData({ orderList: list });
        },
        fail: err => {
          wx.hideLoading();
          console.error(err);
        }
      });
  },

  // ✨✨✨ 申请退款 (修改版：支持发货后退款) ✨✨✨
  applyRefund(e) {
    const item = e.currentTarget.dataset.item;
    
    // 🛑 限制：只有“已支付”或“已发货”才能退
    if (item.status !== 'PAID' && item.status !== 'SHIPPED') {
      return wx.showToast({ title: '当前状态不可退款', icon: 'none' });
    }

    wx.showModal({
      title: '申请退款',
      content: '确定要申请退款吗？商家同意后资金将原路返回。',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...' });
          wx.cloud.callFunction({
            name: 'adminOrderOp',
            data: {
              action: 'apply_refund',
              orderId: item._id
            },
            success: res => {
              wx.hideLoading();
              if (res.result.code === 0) {
                wx.showToast({ title: '申请已提交', icon: 'success' });
                this.getMyOrders(); // 刷新列表
              } else {
                wx.showToast({ title: res.result.msg, icon: 'none' });
              }
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '调用失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 删除订单记录 (软删除)
  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示', content: '确定删除这条记录吗？',
      success: res => {
        if (res.confirm) {
          db.collection('orders').doc(id).update({
            data: { isDeletedByUser: true },
            success: () => {
              wx.showToast({ title: '已删除', icon: 'none' });
              this.getMyOrders();
            }
          });
        }
      }
    });
  },
  
  // 复制单号
  copyNo(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.no });
  }
});