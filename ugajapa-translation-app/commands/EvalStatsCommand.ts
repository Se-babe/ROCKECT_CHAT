import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

export class EvalStatsCommand implements ISlashCommand {
    public command = 'eval-stats';
    public i18nParamsExample = '';
    public i18nDescription = 'Show translation evaluation statistics for this channel';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const roomId = context.getRoom().id;

        // Read evaluation records from persistence
        const { RocketChatAssociationModel, RocketChatAssociationRecord } =
            await import('@rocket.chat/apps-engine/definition/metadata');

        const assoc = new RocketChatAssociationRecord(
            RocketChatAssociationModel.ROOM, `eval_${roomId}`
        );

        const records = await read.getPersistenceReader().readByAssociation(assoc);
        const stats = records[0] as any || { good: 0, poor: 0, inaccurate: 0, total: 0 };

        const total = stats.total || 0;
        const good = stats.good || 0;
        const poor = stats.poor || 0;
        const inaccurate = stats.inaccurate || 0;

        const pct = (n: number) => total > 0 ? Math.round((n/total)*100) + '%' : 'N/A';

        const msg =
            `📊 *Translation Evaluation Statistics — #${context.getRoom().slugifiedName}*\n\n` +
            `Total evaluations: *${total}*\n` +
            `✅ Good: *${good}* (${pct(good)})\n` +
            `👎 Poor: *${poor}* (${pct(poor)})\n` +
            `⚠️ Inaccurate: *${inaccurate}* (${pct(inaccurate)})\n\n` +
            `_React with ✅ 👎 ⚠️ on any translated message to submit your evaluation_`;

        const builder = modify.getNotifier().getMessageBuilder()
            .setText(msg)
            .setRoom(context.getRoom());
        await modify.getNotifier().notifyUser(context.getSender(), builder.getMessage());
    }
}
