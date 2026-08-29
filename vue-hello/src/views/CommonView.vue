<template>

  <el-container style="height: 100vh; border: 1px solid #eee">
    <el-aside width="200px" style="background-color: #eafaf1;">
      <el-menu router default-active="appInfo" :default-openeds="['1']">
        <el-submenu index="1">
          <template slot="title"><i class="el-icon-s-home"></i>手游管理</template>
          <el-menu-item-group>
            <el-menu-item index="/appInfo" class="el-icon-s-tools">手游列表</el-menu-item>
            <el-menu-item index="/about" class="el-icon-s-tools">手游上架</el-menu-item>
          </el-menu-item-group>
        </el-submenu>


      </el-menu>
    </el-aside>

    <el-container>
      <el-header style="text-align: right; font-size: 12px">
        <el-dropdown>
          <i class="el-icon-setting" style="margin-right: 15px"></i>
          <el-dropdown-menu slot="dropdown">
            <el-dropdown-item>查看</el-dropdown-item>
            <el-dropdown-item>新增</el-dropdown-item>
            <el-dropdown-item>删除</el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
        <span>王小虎</span>
      </el-header>

      <el-main>

        <router-view>
        </router-view>

      </el-main>

    </el-container>
  </el-container>
</template>


<style>
.el-header {
  background-color: #B3C0D1;
  color: #333;
  line-height: 60px;
}

.el-aside {
  color: #333;
}
</style>

<script>
export default {
  name: 'CommonView',
  data() {
    return {}
  }, methods: {}
}
</script>
