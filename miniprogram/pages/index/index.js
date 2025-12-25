// pages/index/index.js
const db = wx.cloud.database();

Page({
  data: {
    // 1. 轮播图 (原样保留)
    imgUrls: [
      'cloud://cloud1-3gwzyszw481ccd3d.636c-cloud1-3gwzyszw481ccd3d-1391405188/shop-images/main2.jpg', 
      'cloud://cloud1-3gwzyszw481ccd3d.636c-cloud1-3gwzyszw481ccd3d-1391405188/新建文件夹/banner1.jpg',
      'cloud://cloud1-3gwzyszw481ccd3d.636c-cloud1-3gwzyszw481ccd3d-1391405188/新建文件夹/banner3.jpg',
      'cloud://cloud1-3gwzyszw481ccd3d.636c-cloud1-3gwzyszw481ccd3d-1391405188/新建文件夹/banner4.jpg'
    ],
    
    // 2. 分类数据 (原样保留)
    categories: ['全部', '黄糯玉米', '黑糯玉米', '花糯玉米', '礼盒装'],
    currentCat: 0, // 当前选中的是第几个

    // 3. 显示用的列表 (页面渲染这个)
    goodsList: [],

    // 4. 总库存 (以前是写死的，现在留空，等着从数据库装满它)
    allGoods: []
  },

  onLoad: function () {
    // 页面一进来，去云数据库进货
    this.getAllGoodsFromDB();
  },

  // ✨✨✨ 核心升级：从数据库拉取所有商品 ✨✨✨
  getAllGoodsFromDB() {
    wx.showLoading({ title: '加载美味中...' });

    // 这里的 limit(20) 是为了防止商品以后多了取不全，默认一次取20条
    db.collection('goods').limit(20).get({
      success: res => {
        wx.hideLoading();
        console.log('进货成功，共拿到商品：', res.data.length);

        // 把拿到的数据，同时存两份：
        // 一份给 allGoods (作为仓库，用于筛选)
        // 一份给 goodsList (作为展示，默认显示全部)
        this.setData({
          allGoods: res.data,
          goodsList: res.data
        });
      },
      fail: err => {
        wx.hideLoading();
        console.error('加载失败', err);
        wx.showToast({ title: '网络开小差了', icon: 'none' });
      }
    });
  },

  // ✨✨✨ 分类筛选逻辑 (原样保留) ✨✨✨
  // 因为我们将数据库的数据存到了 this.data.allGoods 里，
  // 所以这段筛选代码完全不需要改，依然能跑通！
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    const categoryName = this.data.categories[index]; 

    // 1. 切换选中状态
    this.setData({ currentCat: index });

    // 2. 开始筛选
    if (index === 0) {
      // 选“全部”：把仓库里的货全拿出来
      this.setData({ goodsList: this.data.allGoods });
    } else {
      // 选其他：只留下 tag 匹配的
      const filteredList = this.data.allGoods.filter(item => {
        return item.tag === categoryName;
      });

      this.setData({ goodsList: filteredList });
      
      // 给个提示
      if(filteredList.length === 0){
        wx.showToast({ title: '暂无该品种', icon: 'none' });
      }
    }
  },

  // 跳转详情 (稍微修改一点点，兼容性更好)
  goToDetail(e) {
    // 注意：WXML里绑定的变量名最好统一检查一下
    // 如果你 WXML 写的 data-goods="{{item}}"，这里就用 e.currentTarget.dataset.goods
    // 如果你 WXML 写的 data-item="{{item}}"，这里就用 e.currentTarget.dataset.item
    const goods = e.currentTarget.dataset.goods || e.currentTarget.dataset.item;
    
    if (goods) {
      const goodsStr = encodeURIComponent(JSON.stringify(goods));
      wx.navigateTo({ url: `/pages/detail/detail?goods=${goodsStr}` });
    }
  },
  
  onShareAppMessage() {
    return { title: '山西源头好玉米' }
  }
});