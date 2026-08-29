<template>
  <div class="about">
    <el-form :inline="true" :model="formInline" class="demo-form-inline">
      <el-form-item label="软件名称">
        <el-input v-model="formInline.softwarename" placeholder="软件名称"></el-input>
      </el-form-item>

      <el-form-item label="APK名称">
        <el-input v-model="formInline.apkname" placeholder="APK名称"></el-input>
      </el-form-item>

      <el-form-item label="一级分类">
        <el-select @change="getLevel2()" v-model="formInline.categorylevel1" placeholder="请选择一级分类">
          <el-option label="请选择一级分类" value=" "></el-option>

          <el-option v-for="c1 in level1" :key="c1.id" :label="c1.categoryname" :value="c1.id"></el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="二级分类">
        <el-select @change="getLevel3()" v-model="formInline.categorylevel2" placeholder="请选择二级分类">
          <el-option label="请选择二级分类" value=" "></el-option>

          <el-option v-for="c2 in level2" :key="c2.id" :label="c2.categoryname" :value="c2.id"></el-option>
        </el-select>

      </el-form-item>


      <el-form-item label="三级分类">
        <el-select v-model="formInline.categorylevel3" placeholder="请选择三级分类">
          <el-option label="请选择三级分类" value=" "></el-option>

          <el-option v-for="c3 in level3" :key="c3.id" :label="c3.categoryname" :value="c3.id"></el-option>
        </el-select>

      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="onSubmit">查询</el-button>
      </el-form-item>

    </el-form>

    <el-table
      :data="tableData"
      border
      style="width: 100%">
      <el-table-column
        fixed
        prop="softwarename"
        label="软件名称"
      >
      </el-table-column>
      <el-table-column
        prop="apkname"
        label="APK名称"
      >
      </el-table-column>
      <el-table-column
        label="LOGO图片"
      >
        <template slot-scope="scope">
          <img :src="scope.row.logopicpath" alt="" style="height: 50px;width: 50px">
        </template>
      </el-table-column>
      <el-table-column
        prop="address"
        label="分类"
      >
        <template slot-scope="scope">
          {{ scope.row.level1Name }} → {{ scope.row.level2Name }} → {{ scope.row.level3Name }}
        </template>
      </el-table-column>
      <el-table-column
        prop="zip"
        label="所属平台"
      >
      </el-table-column>
      <el-table-column
        prop="status"
        label="状态"
      >
        <template slot-scope="scope">
          {{
            scope.row.status == 1 ? '待审核' : scope.row.status == 2 ? '审核成功' : scope.row.status == 3 ? '未通过' : scope.row.status == 4 ? '已上架' : '未上架'
          }}
        </template>
      </el-table-column>
      <el-table-column
        fixed="right"
        label="操作"
        width="100">
        <template slot-scope="scope">
          <el-button @click="handleClick(scope.row)" type="text" size="small">查看</el-button>
          <el-button type="text" size="small">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>


    <el-pagination
      background
      layout="prev, pager, next"
      :current-page="pageNum"
      :page-size="5"
      :total="total"
      @current-change="changePageNum">
    </el-pagination>

  </div>
</template>

<script>
import {getAppCategory, getAppInfoPage} from "@/api/app";

export default {
  name: 'AppInfoView',
  data() {
    return {
      formInline: {
        softwarename: '',
        apkname: '',
        categorylevel1: '',
        categorylevel2: '',
        categorylevel3: '',
      },
      level1: [],
      level2: [],
      level3: [],
      tableData: [],
      total: 0,
      pages: 0,

      pageNum: 1
    }
  },
  methods: {
    getPage() {
      getAppInfoPage(this.formInline, this.pageNum).then(res => {
        console.log(res)
        if (res.code == 2000) {
          this.tableData = res.data.list
          this.pages = res.data.pages
          this.total = res.data.total
          // this.pageNum=res.data.pageNum
          console.log(this.pageNum)
        }
      })
    },
    getTree() {
      getAppCategory().then(res => {
        console.log(res);
        this.level1 = res.data.children
      })
    },

    changePageNum(value) {
      this.pageNum = value
      this.getPage()
    },

    getLevel2(){

      this.level2=''
      this.level3=''
      this.formInline.categorylevel2=''
      this.formInline.categorylevel3=''
      var one=this.formInline.categorylevel1  //一级分类ID，那下一级是谁？

      var data= this.level1
      for (let i = 0; i < data.length; i++) {
        if (one==data[i].id){
          this.level2=data[i].children;
        }
      }


    },
    getLevel3(){
      this.level3=''
      this.formInline.categorylevel3=''


      var two=this.formInline.categorylevel2  //一级分类ID，那下一级是谁？

      var data= this.level2
      for (let i = 0; i < data.length; i++) {
        if (two==data[i].id){
          this.level3=data[i].children;
        }
      }
    }
  },
  created() {
    this.getPage();
    this.getTree()
  }
}
</script>
