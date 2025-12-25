// pages/cart/index.js
const db = wx.cloud.database();
const _ = db.command; // 引入数据库操作符，用于批量删除

Page({
  data: {
    cartList: [],
    totalPrice: 0,
    isAllSelected: true
  },

  onShow: function () {
    this.loadCart(); 
  },

  // 加载购物车
  loadCart() {
    // 💡 必须用 get()，配合云开发权限设置，自动只拉取“我自己”的数据
    db.collection('cart').orderBy('createTime', 'desc').get({
      success: res => {
        this.setData({ cartList: res.data });
        this.calculateTotal(); 
      }
    });
  },

  // 勾选/取消
  onCheckItem(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.cartList;
    list[index].selected = !list[index].selected;
    this.setData({ cartList: list });
    this.calculateTotal();
  },

  // 全选
  onSelectAll() {
    const all = !this.data.isAllSelected;
    const list = this.data.cartList.map(item => {
      item.selected = all;
      return item;
    });
    this.setData({ cartList: list, isAllSelected: all });
    this.calculateTotal();
  },

  // 计算总价
  calculateTotal() {
    let total = 0;
    let isAll = true;
    this.data.cartList.forEach(item => {
      if (item.selected) {
        total += item.price * item.count;
      } else {
        isAll = false; // 只要有一个没选，全选按钮就不亮
      }
    });
    // 如果列表为空，全选也不亮
    if(this.data.cartList.length === 0) isAll = false;

    this.setData({ 
      totalPrice: total.toFixed(2),
      isAllSelected: isAll
    });
  },

  // 删除商品
  deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示', content: '确定移出购物车吗？',
      success: res => {
        if(res.confirm) {
          db.collection('cart').doc(id).remove({
             success: () => { this.loadCart(); }
          });
        }
      }
    });
  },

  // ✨✨✨✨✨ 核心修复：结算流程 (替换了原来的 submitCart) ✨✨✨✨✨
  
  // 1. 点击“去结算”按钮的入口
  submitCart() {
    // A. 检查有没有选商品
    const selectedGoods = this.data.cartList.filter(item => item.selected);
    if (selectedGoods.length === 0) {
      return wx.showToast({ title: '您还没选玉米呢', icon: 'none' });
    }

    // B. 强制选地址 (没有地址，绝对不让往后走)
    wx.chooseAddress({
      success: (addrRes) => {
        // 整理地址格式，方便存库
        const addressInfo = {
          userName: addrRes.userName,
          telNumber: addrRes.telNumber,
          provinceName: addrRes.provinceName,
          cityName: addrRes.cityName,
          countyName: addrRes.countyName,
          detailInfo: addrRes.detailInfo,
          // 拼一个完整的字符串备用
          fullString: `${addrRes.provinceName}${addrRes.cityName}${addrRes.countyName}${addrRes.detailInfo}`
        };
        
        // C. 地址有了，去付钱
        this.startBatchPayment(selectedGoods, addressInfo);
      },
      fail: () => {
        console.log('用户取消选地址');
      }
    });
  },

  // 2. 发起合并支付
  startBatchPayment(goodsList, addressInfo) {
    wx.showLoading({ title: '正在下单...' });
    const that = this;

    // 算出总分
    let totalFee = 0;
    let goodsSummary = "";
    goodsList.forEach(item => {
      totalFee += (item.price * item.count * 100);
      goodsSummary += `${item.name}x${item.count} `;
    });
    
    // 微信限制 body 文字长度，截断一下
    if(goodsSummary.length > 90) goodsSummary = goodsSummary.substring(0, 90) + "...";

    // 呼叫 makeOrder 云函数
    wx.cloud.callFunction({
      name: 'makeOrder',
      data: {
        goodsName: goodsSummary || "购物车合并下单",
        totalFee: Math.floor(totalFee)
      },
      success: res => {
        // 拿到 支付参数 和 关键的商户单号
        const { payment, outTradeNo } = res.result;

        // 调起微信支付
        wx.requestPayment({
          ...payment,
          success: (payRes) => {
            console.log('支付成功，开始存单...');
            // D. 支付成功，带上所有凭证去存数据库
            that.createBatchOrder(goodsList, addressInfo, outTradeNo, payRes.transactionId);
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '支付已取消', icon: 'none' });
          }
        });
      },
      fail: err => {
        wx.hideLoading();
        console.error('下单云函数失败', err);
        wx.showToast({ title: '系统繁忙', icon: 'none' });
      }
    });
  },

  // 3. 批量存单 + 清空购物车
  createBatchOrder(goodsList, addressInfo, outTradeNo, transactionId) {
    // 循环把每个商品存成一条订单
    const tasks = goodsList.map(item => {
      return db.collection('orders').add({
        data: {
          // ✅ 核心：必须存这两个号！
          out_trade_no: outTradeNo,       
          transaction_id: transactionId,
          
          createTime: new Date().getTime(),
          status: 'PAID',
          
          // 金额与商品
          totalFee: Math.floor(item.price * item.count * 100),
          totalPrice: (item.price * item.count).toFixed(2),
          
          goods_id: item.goods_id,
          productName: item.name,
          count: item.count,
          price: item.price,
          image: item.image,

          // 地址
          address: {
            userName: addressInfo.userName,
            telNumber: addressInfo.telNumber,
            provinceName: addressInfo.provinceName,
            cityName: addressInfo.cityName,
            countyName: addressInfo.countyName,
            detailInfo: addressInfo.detailInfo
          },
          
          courier: '待发货',
          expressNo: '',
          remark: '' 
        }
      });
    });

    // 等所有订单都存完了
    Promise.all(tasks).then(() => {
      // 🗑️ 从购物车里把买过的东西删掉
      const idsToDelete = goodsList.map(g => g._id);
      
      db.collection('cart').where({
        _id: _.in(idsToDelete) // 使用 _.in 批量匹配ID
      }).remove().then(() => {
        
        wx.hideLoading();
        wx.showModal({
          title: '购买成功',
          content: '我们会尽快发货！',
          showCancel: false,
          success: () => {
             // 支付成功后跳到订单列表页
             wx.switchTab({ url: '/pages/order/index' });
          }
        });
        
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('存单异常', err);
      wx.showModal({ title: '异常', content: '支付成功但保存异常，请截图联系客服' });
    });
  }
});