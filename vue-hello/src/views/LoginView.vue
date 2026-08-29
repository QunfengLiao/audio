<template>
  <div>

    <el-dialog
      title="欢迎登陆系统"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :visible.sync="dialogVisible"
      width="60%">

      <el-form ref="form" :model="form" label-width="80px">
        <el-form-item label="账号">
          <el-input v-model="form.username"></el-input>
        </el-form-item>

        <el-form-item label="密码">
          <el-input type="password" v-model="form.password"></el-input>
        </el-form-item>

        <el-form-item label="账户类型">
          <el-radio-group v-model="form.userType">
            <el-radio label="admin">管理员</el-radio>
            <el-radio label="dev">开发者</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="onSubmit">登陆</el-button>
          <el-button>取消</el-button>
        </el-form-item>


      </el-form>

      <span slot="footer" class="dialog-footer">
  </span>
    </el-dialog>
  </div>

</template>


<script>
export default {
  name: 'LoginView',
  data() {
    return {
      dialogVisible: true,
      form: {
        username: 'test001',
        password: '123456',
        userType: 'dev'
      }
    }
  },
  methods: {
    onSubmit() {
      this.dialogVisible = false;
      // 延迟一点跳转，确保 dialog 动画和销毁完成
      this.$nextTick(() => {
        setTimeout(() => {
          this.$router.push("/appInfo");
        }, 300); // 300ms 足够 dialog 动画结束
      });
    }
  }

}

</script>
