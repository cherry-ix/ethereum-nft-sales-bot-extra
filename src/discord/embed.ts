import axios from 'axios';
import sharp from 'sharp';
import { formatPrice } from '../utils/api.js';
import { WEBHOOK_URLS, GIF_ENABLED } from '../config/setup.js';
import { formatSweepField, formatSwapField } from './formatField.js';
import { MessageEmbed, WebhookClient, MessageAttachment } from 'discord.js';
import { createGif, createTextImage, createSwapGif } from '../utils/image.js';

import type { TransactionData } from '../types';

const sendEmbedMessage = async (tx: TransactionData) => {
    let file: MessageAttachment;
    const embed = new MessageEmbed();
    const isAggregator =
        tx.recipient === 'gem' || tx.recipient === 'genie' || tx.recipient === 'blurSwap';
    const isSwap = tx.recipient === 'nft-trader';

    if (isSwap && tx.addressMaker && tx.addressTaker) {
        const gifImage = await createSwapGif(tx.swap, tx.addressMaker, tx.addressTaker);

        embed.addField(
            'Maker',
            `[${tx.swap[tx.addressMaker as keyof typeof tx.swap].name}](${tx.market.accountPage}${
                tx.addressMaker
            })`
        );
        await formatSwapField(tx.swap, tx.addressMaker, embed);

        embed.addField(
            'Taker',
            `[${tx.swap[tx.addressTaker as keyof typeof tx.swap].name}](${tx.market.accountPage}${
                tx.addressTaker
            })`
        );
        await formatSwapField(tx.swap, tx.addressTaker, embed);

        embed
            .setTitle(`New ${tx.contractName || tx.tokenName} Swap!`)
            .setURL(`${tx.market.site}${tx.transactionHash}`)
            .setFooter({ text: tx.market.displayName, iconURL: tx.market.iconURL })
            .setColor(tx.market.color)
            .setTimestamp();
        tx.gifImage = gifImage;
        file = new MessageAttachment(gifImage as Buffer, 'image.gif');
        embed.setImage('attachment://image.gif');
    } else if (tx.tokenData && tx.tokenData.image) {
        const priceTitle = tx.quantity > 1 ? 'Total Amount' : 'Price';

        embed
            .setURL(`${tx.market.site}${tx.contractAddress}/${tx.tokenId}`)
            .addField(
                priceTitle,
                `\`${formatPrice(tx.totalPrice)} ${tx.currency.name} ${tx.ethUsdValue}\``,
                isAggregator
            )
            .setFooter({ text: tx.market.displayName, iconURL: tx.market.iconURL })
            .setColor(tx.market.color)
            .setTimestamp();

        if (tx.quantity > 1) {
            embed.setTitle(`${tx.quantity} ${tx.contractName || tx.tokenName} SWEPT!`);
        } else {
            embed.setTitle(`${tx.tokenName} SOLD!`);
        }

        if (tx.tokenType === 'ERC721' && tx.quantity > 1 && GIF_ENABLED) {
            const gifImage = await createGif(tx.tokens, tx.contractAddress, tx.tokenType);

            tx.gifImage = gifImage;
            file = new MessageAttachment(gifImage as Buffer, 'image.gif');
            embed.setImage('attachment://image.gif');
        } else if (!tx.tokenData.image) {
            const naImage = await createTextImage('Content not available yet', true);

            file = new MessageAttachment(naImage, 'image.png');
            embed.setImage('attachment://image.png');
        } else if (tx.tokenData.image.endsWith('.svg')) {
            const buffer = await axios.get(tx.tokenData.image, {
                responseType: 'arraybuffer'
            });
            const image = await sharp(buffer.data).png().toBuffer();

            file = new MessageAttachment(image, 'image.png');
            embed.setImage('attachment://image.png');
        } else if (tx.tokenData.image.startsWith('data:image/svg+xml;base64,')) {
            const base64Image = tx.tokenData.image.replace('data:image/svg+xml;base64,', '');
            const buffer = Buffer.from(base64Image, 'base64');
            const image = await sharp(buffer).png().toBuffer();

            file = new MessageAttachment(image, 'image.png');
            embed.setImage('attachment://image.png');
        } else {
            const response = await axios(tx.tokenData.image, {
                responseType: 'arraybuffer'
            });
            const buffer64 = Buffer.from(response.data, 'binary');
            const fileName = `${tx.tokenId}.png`;

            file = new MessageAttachment(buffer64, fileName);
            embed.setImage(`attachment://${fileName}`);
            // embed.setImage(tx.tokenData.image);
        }

        if (isAggregator || (tx.tokenType === 'ERC721' && tx.quantity > 1)) {
            const fields = [
                {
                    name: 'Sweeper',
                    value: `[${tx.sweeper || tx.to}](${tx.market.accountPage}${
                        tx.sweeperAddr || tx.toAddr
                    })`,
                    inline: false
                }
            ];

            embed.addFields(fields);
            formatSweepField(tx, embed);
        } else if (tx.tokenType === 'ERC1155' || tx.quantity > 1) {
            const isX2Y2 = tx.market.name === 'x2y2' ? '/items' : '';

            embed
                .addField('Quantity', `\`${tx.quantity}\``, false)
                .addField(
                    'From',
                    `[${tx.from}](${tx.market.accountPage}${tx.fromAddr}${isX2Y2})`,
                    true
                )
                .addField('To', `[${tx.to}](${tx.market.accountPage}${tx.toAddr}${isX2Y2})`, true);
        } else if (tx.tokenType === 'ERC721' && tx.quantity === 1) {
            embed
                .addField('From', `[${tx.from}](${tx.market.accountPage}${tx.fromAddr})`, true)
                .addField('To', `[${tx.to}](${tx.market.accountPage}${tx.toAddr})`, true);
        }
    }

    WEBHOOK_URLS.forEach((webhookURL) => {
        const webhookClient = new WebhookClient({ url: webhookURL });

        if (file) {
            webhookClient.send({
                embeds: [embed],
                files: [file]
            });
        } else {
            webhookClient.send({
                embeds: [embed]
            });
        }
    });

    return tx;
};

export { sendEmbedMessage };
