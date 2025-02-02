import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma, WorkflowRuntimeData, WorkflowRuntimeDataStatus } from '@prisma/client';
import { TEntityType } from '@/workflow/types';
import { merge } from 'lodash';
import { assignIdToDocuments } from '@/workflow/assign-id-to-documents';
import { FindLastActiveFlowParams } from '@/workflow/types/params';
import { ProjectScopeService } from '@/project/project-scope.service';
import { SortOrder } from '@/common/query-filters/sort-order';
import type { TProjectIds } from '@/types';
import { toPrismaOrderBy } from '@/workflow/utils/toPrismaOrderBy';

export type ArrayMergeOption = 'by_id' | 'by_index' | 'concat' | 'replace';

@Injectable()
export class WorkflowRuntimeDataRepository {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectScopeService: ProjectScopeService,
    protected readonly scopeService: ProjectScopeService,
  ) {}

  async create<T extends Prisma.WorkflowRuntimeDataCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.WorkflowRuntimeDataCreateArgs>,
  ): Promise<WorkflowRuntimeData> {
    return await this.prisma.workflowRuntimeData.create<T>({
      ...args,
      data: {
        ...args.data,
        context: {
          ...((args.data?.context ?? {}) as any),
          documents: assignIdToDocuments((args.data?.context as any)?.documents),
        },
      },
    } as any);
  }

  async findMany<T extends Prisma.WorkflowRuntimeDataFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.WorkflowRuntimeDataFindManyArgs>,
    projectIds: TProjectIds,
  ) {
    return await this.prisma.workflowRuntimeData.findMany(
      this.scopeService.scopeFindMany(args, projectIds),
    );
  }

  async findOne<T extends Prisma.WorkflowRuntimeDataFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.WorkflowRuntimeDataFindFirstArgs>,
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData | null> {
    return await this.prisma.workflowRuntimeData.findFirst(
      this.scopeService.scopeFindOne(args, projectIds),
    );
  }

  async findById<T extends Omit<Prisma.WorkflowRuntimeDataFindFirstOrThrowArgs, 'where'>>(
    id: string,
    args: Prisma.SelectSubset<T, Omit<Prisma.WorkflowRuntimeDataFindFirstOrThrowArgs, 'where'>>,
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData> {
    return await this.prisma.workflowRuntimeData.findFirstOrThrow(
      this.scopeService.scopeFindOne(merge(args, { where: { id } }), projectIds),
    );
  }

  async findByIdUnscoped(id: string): Promise<WorkflowRuntimeData> {
    return await this.prisma.workflowRuntimeData.findFirstOrThrow({ where: { id } });
  }

  async updateById<T extends Omit<Prisma.WorkflowRuntimeDataUpdateArgs, 'where'>>(
    id: string,
    args: Prisma.SelectSubset<T, Omit<Prisma.WorkflowRuntimeDataUpdateArgs, 'where'>>,
  ): Promise<WorkflowRuntimeData> {
    return await this.prisma.workflowRuntimeData.update({
      where: { id },
      ...args,
    });
  }

  async updateRuntimeConfigById(
    id: string,
    newConfig: any,
    arrayMergeOption: ArrayMergeOption = 'by_id',
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData> {
    const stringifiedConfig = JSON.stringify(newConfig);
    const affectedRows = await this.prisma
      .$executeRaw`UPDATE "WorkflowRuntimeData" SET "config" = jsonb_deep_merge_with_options("config", ${stringifiedConfig}::jsonb, ${arrayMergeOption}) WHERE "id" = ${id} AND "projectId" in (${projectIds?.join(
      ',',
    )})`;

    // Retrieve and return the updated record
    if (affectedRows === 0) {
      throw new Error(`No workflowRuntimeData found with the id "${id}"`);
    }

    return this.findById(id, {}, projectIds);
  }

  async updateContextById(
    id: string,
    newContext: any,
    arrayMergeOption: ArrayMergeOption = 'by_id',
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData> {
    const stringifiedContext = JSON.stringify(newContext);
    const affectedRows = await this.prisma
      .$executeRaw`UPDATE "WorkflowRuntimeData" SET "context" = jsonb_deep_merge_with_options("context", ${stringifiedContext}::jsonb, ${arrayMergeOption}) WHERE "id" = ${id} AND "projectId" in (${projectIds?.join(
      ',',
    )})`;

    // Retrieve and return the updated record
    if (affectedRows === 0) {
      throw new Error(`No workflowRuntimeData found with the id "${id}"`);
    }

    return this.findById(id, {}, projectIds);
  }

  async deleteById<T extends Omit<Prisma.WorkflowRuntimeDataDeleteArgs, 'where'>>(
    id: string,
    args: Prisma.SelectSubset<T, Omit<Prisma.WorkflowRuntimeDataDeleteArgs, 'where'>>,
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData> {
    return await this.prisma.workflowRuntimeData.delete(
      this.scopeService.scopeDelete(
        {
          where: { id },
          ...args,
        },
        projectIds,
      ),
    );
  }

  async findActiveWorkflowByEntity(
    {
      entityId,
      entityType,
      workflowDefinitionId,
    }: {
      entityId: string;
      entityType: TEntityType;
      workflowDefinitionId: string;
    },
    projectIds: TProjectIds,
  ) {
    return await this.findOne(
      {
        where: {
          workflowDefinitionId,
          [entityType]: {
            id: entityId,
          },
          status: {
            not: WorkflowRuntimeDataStatus.completed,
          },
        },
      },
      projectIds,
    );
  }

  async getEntityTypeAndId(workflowRuntimeDataId: string, projectIds: TProjectIds) {
    return await this.findOne(
      {
        where: {
          id: workflowRuntimeDataId,
        },
        select: {
          businessId: true,
          endUserId: true,
        },
      },
      projectIds,
    );
  }

  async findContext(id: string, projectIds: TProjectIds) {
    return (
      await this.prisma.workflowRuntimeData.findFirstOrThrow(
        this.scopeService.scopeFindOne(
          {
            where: { id },
            select: {
              context: true,
            },
          },
          projectIds,
        ),
      )
    )?.context;
  }

  async count<T extends Prisma.WorkflowRuntimeDataFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.WorkflowRuntimeDataFindManyArgs>,
    projectIds: TProjectIds,
  ): Promise<number> {
    return await this.prisma.workflowRuntimeData.count(
      this.scopeService.scopeFindMany(args, projectIds) as any,
    );
  }

  async groupBy<T extends Prisma.WorkflowRuntimeDataGroupByArgs>(
    args: Prisma.SubsetIntersection<T, Prisma.WorkflowRuntimeDataGroupByArgs, any>,
    projectIds: TProjectIds,
  ) {
    return await this.prisma.workflowRuntimeData.groupBy(
      this.scopeService.scopeGroupBy(args, projectIds),
    );
  }

  async search(
    {
      query: { search, take, skip, entityType, workflowDefinitionIds, statuses, orderBy },
      filters,
    }: {
      query: {
        take: number;
        skip: number;
        search?: string;
        entityType: string;
        statuses: string[];
        workflowDefinitionIds?: string[];
        orderBy: Parameters<typeof toPrismaOrderBy>[0];
      };
      filters?: {
        caseStatus?: string[];
        assigneeId?: Array<string | null>;
        status?: WorkflowRuntimeDataStatus[];
      };
    },
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData[]> {
    const [orderByColumn, orderByDirection] = orderBy.split(':');

    const { assigneeIds, includeUnassigned } = {
      assigneeIds: filters?.assigneeId?.filter((id): id is string => id !== null) ?? [],
      includeUnassigned: filters?.assigneeId?.includes(null) || false,
    };

    const assigneeIdsParam = assigneeIds.length
      ? Prisma.join(assigneeIds.map(id => Prisma.sql`${id}`))
      : Prisma.sql``;

    const workflowDefinitionIdsParam = workflowDefinitionIds?.length
      ? Prisma.join(workflowDefinitionIds.map(id => Prisma.sql`${id}`))
      : Prisma.sql``;

    const statusesParam = statuses.length
      ? Prisma.join(statuses.map(status => Prisma.sql`${status}`))
      : Prisma.sql``;

    const projectIdsParam = projectIds?.length
      ? Prisma.join(projectIds.map(id => Prisma.sql`${id}`))
      : Prisma.sql``;

    const caseStatusParam = filters?.caseStatus?.length
      ? Prisma.join(filters.caseStatus.map(status => Prisma.sql`${status}`))
      : Prisma.sql``;

    const sql = Prisma.sql`
        SELECT id
        FROM search_workflow_data(
            ${search}::text,
            ${entityType}::text,
            ${orderByColumn}::text,
            ${orderByDirection}::text,
            array[${workflowDefinitionIdsParam}]::text[],
            array[${statusesParam}]::text[],
            array[${projectIdsParam}]::text[],
            array[${assigneeIdsParam}]::text[],
            array[${caseStatusParam}]::text[],
            ${includeUnassigned}::boolean
        )
        LIMIT ${take} OFFSET ${skip}
    `;

    return (await this.prisma.$queryRaw(sql)) as WorkflowRuntimeData[];
  }

  async findLastActive(
    { workflowDefinitionId, businessId }: FindLastActiveFlowParams,
    projectIds: TProjectIds,
  ): Promise<WorkflowRuntimeData | null> {
    const query = this.projectScopeService.scopeFindOne(
      {
        orderBy: {
          createdAt: 'desc' as SortOrder,
        },
        where: {
          // status: 'active' as WorkflowRuntimeDataStatus,
          businessId,
          workflowDefinitionId,
        },
      },
      projectIds,
    );

    return await this.findOne(query, projectIds);
  }
}
