import {request} from '@/plugins/axios'

export function getAppInfoPage(query,pageNum) {

  return request({
    url: '/appInfo/page',
    method: 'post',
    params: { pageNum },

    data: query
  })
}

export function getAppCategory() {

  return request({
    url: 'appCategory/tree',
    method: 'get'
  })
}

