// pages/detail/detail.js
// 确保这一行在文件最顶部
const db = wx.cloud.database(); 

Page({
  data: {
    goods: {},
    commentList: [],
    myComment: '',
    buyCount: 1 
  },

  onLoad: function (options) {
    if (options.goods) {
      try {
        const goods = JSON.parse(decodeURIComponent(options.goods));
        this.setData({ goods: goods });
        if (goods._id) this.getComments(goods._id);
      } catch (e) {
        console.error('解析失败', e);
      }
    }
  },

  // 数量加减
  minusCount() { if (this.data.buyCount > 1) this.setData({ buyCount: this.data.buyCount - 1 }); },
  addCount() { this.setData({ buyCount: this.data.buyCount + 1 }); },

  // ✨ 工具函数：智能获取图片 (解决图片字段不统一的问题)
  getGoodsImage(g) {
    return g.img || g.image || g.pic || (g.images && g.images[0]) || '';
  },

  // 加入购物车
  addToCart() {
    wx.showLoading({ title: '添加中' });
    const g = this.data.goods;
    // 使用统一的找图逻辑
    const finalImage = this.getGoodsImage(g);
    
    db.collection('cart').add({
      data: {
        goods_id: g._id,
        name: g.name || g.title || g.productName, // 兼容多个名字字段
        price: g.price,
        image: finalImage,
        count: this.data.buyCount,
        createTime: new Date().getTime(),
        selected: true
      },
      success: res => { wx.hideLoading(); wx.showToast({ title: '已加入', icon: 'success' }); },
      fail: err => { wx.hideLoading(); wx.showToast({ title: '失败', icon: 'none' }); }
    });
  },

  // 获取评论
  getComments(goodsId) {
    db.collection('comments').where({ goods_id: goodsId }).orderBy('createTime', 'desc').get({
      success: res => {
        const list = res.data.map(item => {
           let d = new Date(item.createTime);
           let timeStr = `${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
           return { ...item, displayTime: timeStr };
        });
        this.setData({ commentList: list });
      }
    });
  },

  // ✨✨✨ 核心修复区：下单流程 (防幽灵订单版) ✨✨✨

  // 1. 点击购买 -> 必须先选地址
  buyNow() {
    if (this.data.buyCount < 1) return wx.showToast({ title: '至少买一个', icon: 'none' });
    
    wx.chooseAddress({
      success: (addrRes) => {
        // 整理地址
        const addressInfo = {
          userName: addrRes.userName,
          telNumber: addrRes.telNumber,
          provinceName: addrRes.provinceName,
          cityName: addrRes.cityName,
          countyName: addrRes.countyName,
          detailInfo: addrRes.detailInfo
        };
        // 地址选好后，去支付
        this.startPayment(addressInfo);
      },
      fail: () => { 
        console.log('用户取消选地址'); 
        // 用户没选地址，什么都不做，绝对不会生成订单
      }
    });
  },

  // 2. 调起支付
  startPayment(addressInfo) {
    wx.showLoading({ title: '正在下单...' });
    const that = this;
    const g = this.data.goods;
    // 计算金额
    const totalFee = Math.floor(g.price * this.data.buyCount * 100);
    // 拼接商品名
    const goodsName = (g.name || g.title || '商品') + ` x${this.data.buyCount}`;

    wx.cloud.callFunction({
      name: 'makeOrder',
      data: {
        goodsName: goodsName,
        totalFee: totalFee
      },
      success: res => {
        const { payment, outTradeNo } = res.result;
        
        // 调起微信支付窗口
        wx.requestPayment({
          ...payment,
          // 🔴 只有在这里成功了，才去写数据库！
          success: (payRes) => {
            console.log('支付成功，准备存单...');
            that.createOrder(addressInfo, outTradeNo, payRes.transactionId); 
          },
          // 🔴 如果取消支付，这里直接结束，不会去调用 createOrder
          fail: () => { 
            wx.hideLoading(); 
            wx.showToast({ title: '支付已取消', icon: 'none' }); 
          }
        });
      },
      fail: err => { 
        wx.hideLoading(); 
        wx.showToast({ title: '系统繁忙', icon: 'none' }); 
      }
    });
  },

  // 3. 存入数据库 (只在支付成功后运行)
  createOrder(addressInfo, outTradeNo, transactionId) {
    const g = this.data.goods;
    const finalImage = this.getGoodsImage(g); // 确保图片不为空

    db.collection('orders').add({
      data: {
        // ✅ 核心凭证
        out_trade_no: outTradeNo,       
        transaction_id: transactionId,  

        createTime: new Date().getTime(),
        status: 'PAID', // 直接标记为已支付
        
        // 金额与商品
        totalFee: Math.floor(g.price * this.data.buyCount * 100),
        totalPrice: (g.price * this.data.buyCount).toFixed(2),
        goods_id: g._id,
        productName: g.name || g.title,
        count: this.data.buyCount,
        price: g.price,
        image: finalImage, // 使用智能获取的图片

        // 地址信息
        address: addressInfo,
        
        courier: '待发货',
        expressNo: '',
        remark: ''
      },
      success: () => {
        wx.hideLoading();
        wx.showModal({
          title: '购买成功',
          content: '我们会尽快发货！',
          showCancel: false,
          success: () => { wx.switchTab({ url: '/pages/order/index' }); }
        });
      },
      fail: () => {
        wx.hideLoading();
        // 极小概率事件：钱扣了但网断了没存进数据库
        // 可以在这里加一个日志上报，或者提示用户截图联系客服
        wx.showModal({ title: '提示', content: '支付成功，正在同步订单...' });
        // 兜底方案：哪怕这里报错，因为有transaction_id在微信那边，钱是安全的
      }
    });
  },

  // 跳转回首页
  goHome() {
    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => { wx.switchTab({ url: '/pages/index/index' }); }
    });
  },

  // 留言输入
  onInputComment(e) { this.setData({ myComment: e.detail.value }); },

  // 提交留言
  submitComment() {
    if (!this.data.myComment.trim()) return wx.showToast({ title: '写点内容', icon: 'none' });
    const ui = wx.getStorageSync('userInfo') || {};
    
    db.collection('comments').add({
      data: {
        content: this.data.myComment,
        goods_id: this.data.goods._id,
        createTime: new Date().getTime(),
        nickName: ui.nickName || '食客' + Math.floor(Math.random()*1000),
        avatarUrl: ui.avatarUrl || ''
      },
      success: () => {
        wx.showToast({ title: '留言成功', icon: 'success' });
        this.setData({ myComment: '' });
        this.getComments(this.data.goods._id);
      }
    });
  },

  onShareAppMessage() { return { title: this.data.goods.name }; }
});