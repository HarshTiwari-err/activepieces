import {
    ActivepiecesError,
    ALL_PRINCIPAL_TYPES,
    ErrorCode,
    File,
    FileLocation,
    FileType,
    PrincipalType,
    StepFileUpsert,
} from '@activepieces/shared'
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { StatusCodes } from 'http-status-codes'
import { jwtUtils } from '../../helper/jwt-utils'
import { fileService } from '../file.service'
import { s3Helper } from '../s3-helper'
import { stepFileService } from './step-file.service'


export const stepFileController: FastifyPluginAsyncTypebox = async (app) => {
    app.get('/signed', SignedFileRequest, async (request, reply) => {
        const file = await getFileByToken(request.query.token)

        switch (file.location) {
            case FileLocation.S3: {
                const url = await s3Helper.getS3SignedUrl(file.s3Key!, file.fileName ?? 'unknown')
                return reply
                    .status(StatusCodes.TEMPORARY_REDIRECT)
                    .header('Location', url)
                    .send()
            }
            case FileLocation.DB: {
                const { data } = await fileService.getDataOrThrow({
                    fileId: file.id,
                    type: FileType.FLOW_STEP_FILE,
                })
                return reply
                    .header(
                        'Content-Disposition',
                        `attachment; filename="${file.fileName}"`,
                    )
                    .type('application/octet-stream')
                    .status(StatusCodes.OK)
                    .send(data)
            }
        }
    })

    app.post('/', UpsertStepFileRequest, async (request) => {
        const file = await stepFileService.saveAndEnrich({
            fileName: request.body.file.filename,
            flowId: request.body.flowId,
            stepName: request.body.stepName,
            file: request.body.file.data as Buffer,
        }, request.hostname, request.principal.projectId)
        return file
    })
}

type FileToken = {
    fileId: string
}

async function getFileByToken(token: string): Promise<Omit<File, 'data'>> {
    try {
        const decodedToken = await jwtUtils.decodeAndVerify<FileToken>({
            jwt: token,
            key: await jwtUtils.getJwtSecret(),
        })
        return await fileService.getFileOrThrow({
            fileId: decodedToken.fileId,
            type: FileType.FLOW_STEP_FILE,
        })
    }
    catch (e) {
        throw new ActivepiecesError({
            code: ErrorCode.INVALID_BEARER_TOKEN,
            params: {
                message: 'invalid token or expired for the step file',
            },
        })
    }
}

const SignedFileRequest = {
    config: {
        allowedPrincipals: ALL_PRINCIPAL_TYPES,
    },
    schema: {
        querystring: Type.Object({
            token: Type.String(),
        }),
    },
}

const UpsertStepFileRequest = {
    config: {
        allowedPrincipals: [PrincipalType.ENGINE],
    },
    schema: {
        body: StepFileUpsert,
    },
}
