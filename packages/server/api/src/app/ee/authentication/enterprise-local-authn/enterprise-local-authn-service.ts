import {
    OtpType,
    ResetPasswordRequestBody,
    VerifyEmailRequestBody,
} from '@activepieces/ee-shared'
import { ActivepiecesError, assertNotNullOrUndefined, ErrorCode, isNil, UserId } from '@activepieces/shared'
import { userService } from '../../../user/user-service'
import { otpService } from '../../otp/otp-service'

export const enterpriseLocalAuthnService = {
    async verifyEmail({ userId, otp }: VerifyEmailRequestBody): Promise<void> {
        await confirmOtp({
            userId,
            otp,
            otpType: OtpType.EMAIL_VERIFICATION,
        })

        await userService.verify({ id: userId })
    },

    async resetPassword({
        userId,
        otp,
        newPassword,
    }: ResetPasswordRequestBody): Promise<void> {
        await confirmOtp({
            userId,
            otp,
            otpType: OtpType.PASSWORD_RESET,
        })

        await userService.updatePassword({
            id: userId,
            newPassword,
        })

        const user = await userService.getOneOrFail({
            id: userId,
        })

        assertNotNullOrUndefined(user.platformId, 'Platform id is not set')
        await userService.changeSession({
            id: userId,
            platformId: user.platformId,
        })
    },
}

const confirmOtp = async ({
    userId,
    otp,
    otpType,
}: ConfirmOtpParams): Promise<void> => {
    const isOtpValid = await otpService.confirm({
        userId,
        type: otpType,
        value: otp,
    })

    if (!isOtpValid) {
        throw new ActivepiecesError({
            code: ErrorCode.INVALID_OTP,
            params: {},
        })
    }
}

type ConfirmOtpParams = {
    userId: UserId
    otp: string
    otpType: OtpType
}
