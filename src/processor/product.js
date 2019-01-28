import PlatformFactory from '../platform/factory'
const jwa = require('jwa');
const hmac = jwa('HS256');
import { sgnSrc } from '../lib/util'

class ProductProcessor {
  constructor(config, entityType, indexName){
    this._config = config
    this._entityType = entityType
    this._indexName = indexName
  }

  process (items, groupId = null) {
    console.debug('Entering ProductProcessor::process')

    const processorChain = []

    const platform = this._config.platform
    const factory = new PlatformFactory(this._config)
    const taxCountry = this._config.tax.defaultCountry
    const taxProcessor = factory.getAdapter(platform, 'tax', this._indexName, taxCountry)

    processorChain.push(taxProcessor.process(items, groupId))

    return Promise.all(processorChain).then(((resultSet) => {

      if (!resultSet || resultSet.length === 0) {
        throw Error('error with resultset for processor chaining')
      }

      const rs = resultSet[0].map(((item) => {
        if (!item._source)
          return item

        const config = this._config
        let sgnObj = (config.tax.calculateServerSide === true) ? { priceInclTax: item._source.priceInclTax } : { price: item._source.price }
        item._source.sgn = hmac.sign(sgnSrc(sgnObj, item), config.objHashSecret); // for products we sign off only price and id becase only such data is getting back with orders

        // process magento's media urls
        if (item._source.description) {
          item._source.description = item._source.description.replace(/\{\{media url="(.*?)"\}\}/g, function(match, url) {
            return 'https://xxx.soboredclub.com/media/' + url
          });
        }
        if (item._source.short_description) {
          item._source.short_description = item._source.short_description.replace(/\{\{media url="(.*?)"\}\}/g, function(match, url) {
            return 'https://xxx.soboredclub.com/media/' + url
          });
        }

        if (item._source.configurable_children) {
          item._source.configurable_children = item._source.configurable_children.map((subItem) => {
            if (subItem) {
              let sgnObj = (config.tax.calculateServerSide === true) ? { priceInclTax: subItem.priceInclTax } : { price: subItem.price }
              subItem.sgn = hmac.sign(sgnSrc(sgnObj, subItem), config.objHashSecret);
            }

            return subItem
          })
        }

        return item
      }).bind(this))

      // return first resultSet
      return rs
    }).bind(this))
  }
}

module.exports = ProductProcessor
