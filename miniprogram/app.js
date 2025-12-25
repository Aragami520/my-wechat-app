App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // ★这里也要填刚才那个环境ID
        env: 'cloud1-3gwzyszw481ccd3d',
        traceUser: true,
      })
    }
  }
})