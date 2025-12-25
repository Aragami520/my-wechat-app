// pages/admin/index.js
const db = wx.cloud.database();
const _ = db.command;

const ADMIN_LIST = [
  'oZ6JU17tMbuDSmQGJ9yF2CYJRxvY', // 您的ID
  'oZ6JU1_mJ4O6xL1ellJJw5jPCL8k', // 家人1的ID
  'oZ6JU10SQWIXECyt7I1spANJCTOQ'  // 家人2的ID
];

Page({
  data: {
    isAdmin: false,
    stats: {
      todaySales: 0,
      todayCount: 0,
      pendingShip: 0,
      pendingRefund: 0
    },
    pendingOrders: [] // 待处理订单列表
  },

  onLoad: function () {
    this.checkAuth();
  },

  // 下拉刷新 (想看新订单，往下拉一下就行)
  onPullDownRefresh: function() {
    if (this.data.isAdmin) {
      this.loadDashboardData();
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // 1. 身份核验
  checkAuth() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        const myOpenId = res.result.openid;
        console.log('当前用户ID:', myOpenId);

        // 检查当前用户是否在管理员名单里
        if (ADMIN_LIST.includes(myOpenId)) {
          this.setData({ isAdmin: true });
          this.loadDashboardData(); // 身份确认，开始加载数据
        } else {
          this.setData({ isAdmin: false });
          wx.showModal({
            title: '无权访问',
            content: '您不是管理员，无法查看商家后台。',
            showCancel: false,
            success: () => {
              wx.switchTab({ url: '/pages/index/index' });
            }
          });
        }
      },
      fail: err => {
        console.error('登录失败', err);
        wx.showToast({ title: '系统异常', icon: 'none' });
      }
    });
  },

  // 2. 加载数据 (核心功能：不再使用 watch，改用 get)
  loadDashboardData() {
    wx.showLoading({ title: '同步数据中...' });

    // A. 统计今日数据
    this.calculateStats();

    // B. 拉取待发货/待退款订单
    db.collection('orders')
      .where({
        // 只看 "已支付"、"待发货"、"退款中" 的
        status: _.in(['PAID', 'SHIPPED', 'REFUNDING'])
      })
      .orderBy('createTime', 'desc') // 最新的在最上面
      .get({
        success: res => {
          wx.hideLoading();
          wx.stopPullDownRefresh(); // 停止下拉动画

          const list = res.data.map(item => {
            // 格式化时间
            const d = new Date(item.createTime);
            item.createTimeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
            
            // 状态中文显示
            if(item.status === 'PAID') item.displayStatus = '待发货';
            else if(item.status === 'SHIPPED') item.displayStatus = '已发货';
            else if(item.status === 'REFUNDING') item.displayStatus = '申请退款';
            
            return item;
          });

          this.setData({ pendingOrders: list });
        },
        fail: err => {
          wx.hideLoading();
          wx.stopPullDownRefresh();
          console.error('订单加载失败', err);
          // 这里如果不弹窗，体验更好，因为可能是权限问题正在生效中
        }
      });
  },

  // 3. 计算统计数据
  calculateStats() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayTs = today.getTime();

    db.collection('orders').where({
      createTime: _.gte(todayTs),
      status: _.neq('unpaid') // 只要不是未支付的都算
    }).get({
      success: res => {
        let sales = 0;
        let count = res.data.length;
        res.data.forEach(o => {
          // 防止数据里 totalFee 是空的
          let fee = o.totalFee || (o.price * o.count * 100) || 0;
          sales += fee;
        });

        this.setData({
          'stats.todaySales': (sales / 100).toFixed(2),
          'stats.todayCount': count
        });
      }
    });
    
    // 统计待办数量
    db.collection('orders').where({ status: 'PAID' }).count().then(res => {
      this.setData({ 'stats.pendingShip': res.total });
    });
    db.collection('orders').where({ status: 'REFUNDING' }).count().then(res => {
      this.setData({ 'stats.pendingRefund': res.total });
    });
  },

  // 一键复制收货信息
  copyAddress(e) {
    const addr = e.currentTarget.dataset.address;
    if(!addr) return;
    const text = `收件人：${addr.userName}\n电话：${addr.telNumber}\n地址：${addr.provinceName}${addr.cityName}${addr.countyName}${addr.detailInfo}`;
    wx.setClipboardData({
      data: text,
      success: () => { wx.showToast({ title: '地址已复制', icon: 'none' }) }
    })
  },

  // 发货
  handleShip(e) {
    const orderId = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认发货',
      editable: true,
      placeholderText: '请输入快递单号',
      success: (res) => {
        if (res.confirm) {
          const expressNo = res.content;
          if (!expressNo) return wx.showToast({ title: '单号不能为空', icon: 'none' });

          wx.showLoading({ title: '提交中' });
          wx.cloud.callFunction({
            name: 'adminOrderOp',
            data: {
              action: 'ship',
              orderId: orderId,
              expressNo: expressNo
            },
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '发货成功' });
              that.loadDashboardData(); // 刷新列表
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 处理退款
  handleRefund(e) {
    const orderId = e.currentTarget.dataset.id;
    const that = this;

    wx.showModal({
      title: '退款处理',
      content: '确定要同意退款吗？资金将原路返回。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退款中' });
          wx.cloud.callFunction({
            name: 'adminOrderOp',
            data: {
              action: 'refund',
              orderId: orderId
            },
            success: (res) => {
              wx.hideLoading();
              if(res.result.code === 0) {
                 wx.showToast({ title: '退款成功' });
                 that.loadDashboardData();
              } else {
                 wx.showModal({ title: '退款失败', content: res.result.msg, showCancel: false });
              }
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '云函数异常', icon: 'none' });
            }
          });
        }
      }
    });
  }
});