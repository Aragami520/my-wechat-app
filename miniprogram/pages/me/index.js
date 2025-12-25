// pages/me/index.js
Page({
  data: {
    userInfo: {
      avatarUrl: '', 
      nickName: ''
    },
    isAdmin: false,
    myOpenId: '点击获取'
  },

  onShow: function() {
    // 每次显示页面时都检查一下权限
    this.checkAdmin();
    
    // 读取缓存的用户信息
    const ui = wx.getStorageSync('userInfo');
    if(ui) this.setData({ userInfo: ui });
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    const newUserInfo = { ...this.data.userInfo, avatarUrl: avatarUrl };
    this.setData({ userInfo: newUserInfo });
    wx.setStorageSync('userInfo', newUserInfo);
  },

  onInputNickname(e) {
    const nickName = e.detail.value;
    const newUserInfo = { ...this.data.userInfo, nickName: nickName };
    this.setData({ userInfo: newUserInfo });
    wx.setStorageSync('userInfo', newUserInfo);
  },

  // ✨✨✨ 核心：鉴权函数 ✨✨✨
  checkAdmin() {
    wx.cloud.callFunction({
      name: 'login', 
      success: res => {
        const currentOpenId = res.result.openid;
        this.setData({ myOpenId: currentOpenId });

        // 👇👇👇 在这里把家人的 ID 都填进去！👇👇👇
        const ADMIN_LIST = [
          'oZ6JU17tMbuDSmQGJ9yF2CYJRxvY', // 您的ID (请确认)
          'oZ6JU1_mJ4O6xL1ellJJw5jPCL8k', // 妈妈的ID (请替换真实ID)
          'oZ6JU10SQWIXECyt7I1spANJCTOQ'  // 姐姐的ID (请替换真实ID)
        ];

        // 只要当前用户的 ID 在名单里，就显示管理员入口
        if (ADMIN_LIST.includes(currentOpenId)) {
          this.setData({ isAdmin: true });
        } else {
          this.setData({ isAdmin: false });
        }
      },
      fail: err => {
        console.error('获取OpenID失败', err);
      }
    });
  },

  copyId() {
    wx.setClipboardData({
      data: this.data.myOpenId,
      success: function() { wx.showToast({ title: '已复制', icon: 'success' }); }
    });
  },

  goToOrder(e) { 
    // 这里可以根据 data-type 做不同跳转，目前先统一跳到订单页
    wx.switchTab({ url: '/pages/order/index' }); 
  },
  
  chooseAddress() { wx.chooseAddress({}); },
  goToAbout() { wx.navigateTo({ url: '/pages/about/about' }); },
  goToAdmin() { wx.navigateTo({ url: '/pages/admin/index' }); }
});