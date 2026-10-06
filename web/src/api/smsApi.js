import { baseApi } from './baseApi'

export const smsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSmsStatus: builder.query({
      query: () => '/sms',
      providesTags: ['Sms'],
    }),
    sendSmsCode: builder.mutation({
      query: (body) => ({ url: '/sms/send-code', method: 'POST', body }),
    }),
    verifySmsCode: builder.mutation({
      query: (body) => ({ url: '/sms/verify', method: 'POST', body }),
      invalidatesTags: ['Sms'],
    }),
    updateSms: builder.mutation({
      query: (body) => ({ url: '/sms', method: 'PATCH', body }),
      invalidatesTags: ['Sms'],
    }),
    sendSmsTest: builder.mutation({
      query: () => ({ url: '/sms/test', method: 'POST' }),
    }),
    removeSmsPhone: builder.mutation({
      query: () => ({ url: '/sms', method: 'DELETE' }),
      invalidatesTags: ['Sms'],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetSmsStatusQuery,
  useSendSmsCodeMutation,
  useVerifySmsCodeMutation,
  useUpdateSmsMutation,
  useSendSmsTestMutation,
  useRemoveSmsPhoneMutation,
} = smsApi
