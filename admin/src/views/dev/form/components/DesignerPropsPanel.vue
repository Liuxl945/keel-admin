<template>
  <aside class="designer__props">
    <el-tabs v-model="propsTab" class="props-tabs" stretch>
      <el-tab-pane
        v-for="tab in propsTabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
      />
    </el-tabs>
    <el-scrollbar class="designer__panel-scroll">
      <!-- 子表明细列：和普通控件同一套「组件属性 / 组件样式」 -->
      <el-form
        v-if="propsTab === 'field' && selectedSubColumn && selectedSubColumnSubtable"
        label-position="top"
        size="small"
        class="props-form"
      >
        <el-form-item label="所属子表">
          <el-input
            :model-value="`${selectedSubColumnSubtable.label}（${selectedSubColumnSubtable.tableName || '未关联从表'}）`"
            disabled
          />
        </el-form-item>
        <el-form-item label="控件字段">
          <el-select
            :model-value="selectedSubColumn.columnName ?? ''"
            filterable
            clearable
            placeholder="请选择从表字段"
            style="width: 100%"
            :disabled="!selectedSubColumnSubtable.tableName"
            @change="handleSubColumnColumnChange"
          >
            <el-option
              v-for="column in subColumnOptions(selectedSubColumnSubtable.tableName)"
              :key="column.columnName"
              :label="`${column.comment || column.columnName}（${column.columnName} / ${column.type}）${isSubColumnUsedByOther(column) ? ' · 已使用' : ''}`"
              :value="column.columnName"
              :disabled="isSubColumnUsedByOther(column)"
            />
          </el-select>
          <span v-if="!selectedSubColumnSubtable.tableName" class="props-hint">
            该子表组件还没有关联从表，请选中子表组件后到「组件属性」里选择关联子表
          </span>
        </el-form-item>
        <!-- <el-form-item label="控件类型">
          <el-select
            v-model="selectedSubColumn.type"
            style="width: 100%"
            @change="handleFieldTypeChange(selectedSubColumn)"
          >
            <el-option
              v-for="type in subColumnTypeOptionsOf(selectedSubColumn)"
              :key="type"
              :label="typeLabels[type]"
              :value="type"
            />
          </el-select>
        </el-form-item> -->
        <el-form-item label="控件标题">
          <el-input v-model="selectedSubColumn.label" maxlength="100" />
        </el-form-item>
        <el-form-item label="字段名（自动映射）">
          <el-input :model-value="selectedSubColumn.name" disabled />
        </el-form-item>

        <div class="props-section-title">校验与状态</div>
        <el-form-item label="是否必填">
          <el-switch
            v-model="selectedSubColumn.required"
            :disabled="selectedSubColumnSource ? !selectedSubColumnSource.nullable : false"
          />
          <span
            v-if="selectedSubColumnSource && !selectedSubColumnSource.nullable"
            class="props-hint"
          >
            从表非空字段必须必填
          </span>
        </el-form-item>
        <el-form-item label="在明细中显示">
          <el-switch v-model="selectedSubColumn.visible" />
          <span class="props-hint">关掉后只作为列表列 / 查询条件，不出现在录入表单里</span>
        </el-form-item>
        <el-form-item label="禁用">
          <el-switch v-model="selectedSubColumn.disabled" />
        </el-form-item>
        <el-form-item
          v-if="['input', 'select', 'date', 'datetime', 'color', 'qrcode', 'barcode'].includes(selectedSubColumn.type)"
          label="可清空"
        >
          <el-switch v-model="selectedSubColumn.clearable" />
        </el-form-item>
        <el-form-item
          v-if="['input', 'textarea', 'number', 'select', 'date', 'datetime', 'file', 'image', 'qrcode', 'barcode'].includes(selectedSubColumn.type)"
          label="占位提示"
        >
          <el-input v-model="selectedSubColumn.placeholder" maxlength="200" />
        </el-form-item>
        <template v-if="['file', 'image'].includes(selectedSubColumn.type)">
          <div class="props-section-title">上传配置</div>
          <el-form-item label="最大上传数">
            <el-input-number
              :model-value="selectedSubColumn.maxCount ?? 9"
              :min="1"
              :max="99"
              :step="1"
              style="width: 100%"
              @update:model-value="(value: number | undefined) => setUploadCount(selectedSubColumn, value)"
            />
            <span class="props-hint">默认 9 个，达到上限后隐藏上传按钮</span>
          </el-form-item>
          <el-form-item label="文件大小上限">
            <el-input-number
              :model-value="selectedSubColumn.maxSize ?? 10"
              :min="1"
              :max="2048"
              :step="1"
              style="width: 100%"
              @update:model-value="(value: number | undefined) => setUploadSize(selectedSubColumn, value)"
            />
            <span class="props-hint">单位 MB，超出时阻止上传并提示</span>
          </el-form-item>
          <el-form-item label="允许类型">
            <el-select
              :model-value="selectedSubColumn.acceptTypes ?? []"
              multiple
              collapse-tags
              collapse-tags-tooltip
              placeholder="不选则不限类型"
              style="width: 100%"
              @update:model-value="(value: string[]) => setAcceptTypes(selectedSubColumn, value)"
            >
              <el-option
                v-for="item in UPLOAD_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <span class="props-hint">可多选，如图片 + PDF + Excel</span>
          </el-form-item>
          <el-form-item label="自定义后缀">
            <el-input
              v-model="selectedSubColumn.accept"
              maxlength="200"
              placeholder="如 .dwg,.psd；留空不追加"
            />
          </el-form-item>
          <el-form-item label="上传提示">
            <el-input
              v-model="selectedSubColumn.tip"
              maxlength="200"
              placeholder="留空自动按数量/大小生成"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="['date', 'datetime'].includes(selectedSubColumn.type)"
          :label="formatLabelOf(selectedSubColumn.type)"
        >
          <el-select v-model="selectedSubColumn.dateFormat" style="width: 100%">
            <el-option
              v-for="item in formatOptionsOf(selectedSubColumn.type)"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span class="props-hint">{{ formatHintOf(selectedSubColumn.type) }}</span>
        </el-form-item>
        <template v-if="['qrcode', 'barcode'].includes(selectedSubColumn.type)">
          <div class="props-section-title">内容来源</div>
          <el-form-item label="内容来源">
            <el-radio-group v-model="selectedSubColumn.codeSource">
              <el-radio-button value="fixed">固定值</el-radio-button>
              <el-radio-button value="link">组件联动</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="selectedSubColumn.codeSource === 'fixed'" label="固定内容">
            <el-input
              v-model="selectedSubColumn.codeValue"
              maxlength="500"
              placeholder="每次都生成这个内容"
            />
          </el-form-item>
          <template v-else-if="selectedSubColumn.codeSource === 'link'">
            <el-form-item label="关联字段">
              <el-select
                v-model="selectedSubColumn.codeFields"
                multiple
                filterable
                placeholder="选择同子表内的字段"
                style="width: 100%"
              >
                <el-option
                  v-for="item in codeFieldOptions"
                  :key="item.name"
                  :label="item.label"
                  :value="item.name"
                />
              </el-select>
              <span class="props-hint">按选择顺序拼接这些字段当前输入的值</span>
            </el-form-item>
            <el-form-item label="拼接分隔符">
              <el-input
                v-model="selectedSubColumn.codeSeparator"
                maxlength="10"
                placeholder="例如 - 或 |，留空直接拼接"
              />
            </el-form-item>
          </template>
        </template>
        <template
          v-if="isPickerType(selectedSubColumn.type) && !isBuiltinPickerType(selectedSubColumn.type)"
        >
          <div class="props-section-title">数据源配置</div>
          <el-form-item label="数据来源">
            <div class="picker-source-row">
              <el-select
                :model-value="selectedSubColumn.sourceId ?? null"
                filterable
                clearable
                placeholder="请选择已发布的数据来源"
                style="width: 100%"
                :loading="pickerSourceLoading"
                @change="handlePickerSourceChange"
              >
                <el-option
                  v-for="item in pickerSourceOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-button link type="primary" title="刷新数据源列表" @click="loadPickerSources">
                刷新
              </el-button>
            </div>
            <span class="props-hint">{{ pickerSourceHint }}</span>
          </el-form-item>
          <el-form-item label="存储字段">
            <el-select
              v-model="selectedSubColumn.valueField"
              filterable
              clearable
              placeholder="选中行的哪一列作为写入值"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
            <span class="props-hint">
              写入当前明细列绑定的从表字段；建议绑定 varchar/text 列
            </span>
          </el-form-item>
          <el-form-item label="回显字段">
            <el-select
              v-model="selectedSubColumn.displayField"
              filterable
              clearable
              placeholder="选中行的哪一列作为显示文本"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="列表字段">
            <el-select
              :model-value="(selectedSubColumn.listFields ?? []).map((item) => item.key)"
              multiple
              filterable
              placeholder="弹框列表显示哪些列"
              style="width: 100%"
              :loading="pickerFieldsLoading"
              @change="handlePickerListFieldsChange"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="item.label || item.key"
                :value="item.key"
              />
            </el-select>
            <span v-if="!pickerFieldOptions.length" class="props-hint">
              请先选择数据来源，字段列表会自动加载
            </span>
          </el-form-item>
          <el-form-item label="搜索字段">
            <el-select
              v-model="selectedSubColumn.keywordKey"
              filterable
              clearable
              placeholder="可选"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerKeywordOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
            <span class="props-hint">
              关联表单需目标表单把它配成查询字段；弹框选择需接口声明同名参数
            </span>
          </el-form-item>
          <el-form-item label="选择模式">
            <el-switch
              :model-value="Boolean(selectedSubColumn.multiple)"
              active-text="多选"
              inactive-text="单选"
              @change="handlePickerMultipleChange"
            />
          </el-form-item>
          <el-form-item label="弹框标题">
            <el-input
              v-model="selectedSubColumn.pickerTitle"
              maxlength="100"
              placeholder="留空按控件标题生成"
            />
          </el-form-item>
        </template>
        <template v-else-if="isBuiltinPickerType(selectedSubColumn.type)">
          <div class="props-section-title">选择配置</div>
          <el-form-item label="数据来源">
            <el-tag type="info" effect="plain">
              {{ selectedSubColumn.type === 'userSelect' ? '系统用户' : '系统角色' }}
            </el-tag>
            <span class="props-hint">内置数据源，弹框自动加载，无需配置字段</span>
          </el-form-item>
          <el-form-item label="选择模式">
            <el-switch
              :model-value="Boolean(selectedSubColumn.multiple)"
              active-text="多选"
              inactive-text="单选"
              @change="handlePickerMultipleChange"
            />
          </el-form-item>
          <el-form-item label="弹框标题">
            <el-input
              v-model="selectedSubColumn.pickerTitle"
              maxlength="100"
              placeholder="留空按控件标题生成"
            />
          </el-form-item>
        </template>
        <template v-if="['number', 'slider'].includes(selectedSubColumn.type)">
          <el-form-item label="最小值">
            <el-input-number v-model="selectedSubColumn.min" style="width: 100%" />
          </el-form-item>
          <el-form-item label="最大值">
            <el-input-number v-model="selectedSubColumn.max" style="width: 100%" />
          </el-form-item>
          <el-form-item v-if="selectedSubColumn.type === 'slider'" label="步长">
            <el-input-number
              v-model="selectedSubColumn.step"
              :min="0.01"
              :precision="2"
              style="width: 100%"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="['select', 'radio', 'checkbox'].includes(selectedSubColumn.type)"
          label="选项"
        >
          <div class="option-list">
            <div
              v-for="(option, index) in selectedSubColumn.options"
              :key="index"
              class="option-row"
            >
              <el-input v-model="option.label" placeholder="标签" />
              <el-input v-model="option.value" placeholder="值" />
              <el-button link type="danger" @click="removeOption(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button link type="primary" @click="addOption">
              <el-icon><Plus /></el-icon>
              添加选项
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <el-form v-if="propsTab === 'field' && selectedField" label-position="top" size="small" class="props-form">
        <el-form-item label="数据库表">
          <el-input :model-value="tableName" disabled />
        </el-form-item>
        <el-form-item label="控件字段">
          <el-select
            :model-value="selectedField.columnName ?? ''"
            filterable
            clearable
            placeholder="请选择数据库字段"
            style="width: 100%"
            @change="handleSelectedColumnChange"
          >
            <el-option
              v-for="column in columnOptionsFor(selectedField)"
              :key="column.columnName"
              :label="`${column.comment || column.columnName}（${column.columnName} / ${column.type}）${isColumnUsedByOther(column, selectedField) ? ' · 已使用' : ''}`"
              :value="column.columnName"
              :disabled="isColumnUsedByOther(column, selectedField)"
            />
          </el-select>
          <span v-if="isDisplayOnly(selectedField.type)" class="props-hint">
            二维码/条码为展示型控件，可不绑定数据库字段，内容在下方「内容来源」中设置
          </span>
        </el-form-item>
        <!-- <el-form-item label="控件类型">
          <el-select
            v-model="selectedField.type"
            style="width: 100%"
            @change="handleFieldTypeChange(selectedField)"
          >
            <el-option
              v-for="type in typeOptionsOf(selectedField)"
              :key="type"
              :label="typeLabels[type]"
              :value="type"
            />
          </el-select>
          <span v-if="!selectedField.columnName" class="props-hint">
            未绑定字段可以自由选控件类型，绑定后按数据库列类型收敛
          </span>
        </el-form-item> -->
        <el-form-item label="控件标题">
          <el-input v-model="selectedField.label" maxlength="100" />
        </el-form-item>
        <el-form-item label="字段名（自动映射）">
          <el-input :model-value="selectedField.name" disabled />
        </el-form-item>

        <div class="props-section-title">校验与状态</div>
        <el-form-item label="是否必填">
          <el-switch
            v-model="selectedField.required"
            :disabled="selectedColumn ? !selectedColumn.nullable : false"
          />
          <span v-if="selectedColumn && !selectedColumn.nullable" class="props-hint">
            数据库非空字段必须必填
          </span>
        </el-form-item>
        <el-form-item label="禁用">
          <el-switch v-model="selectedField.disabled" />
        </el-form-item>
        <el-form-item
          v-if="['input', 'select', 'date', 'datetime', 'color', 'qrcode', 'barcode'].includes(selectedField.type)"
          label="可清空"
        >
          <el-switch v-model="selectedField.clearable" />
        </el-form-item>
        <el-form-item
          v-if="['input', 'textarea', 'number', 'select', 'date', 'datetime', 'file', 'image', 'qrcode', 'barcode'].includes(selectedField.type)"
          label="占位提示"
        >
          <el-input v-model="selectedField.placeholder" maxlength="200" />
        </el-form-item>
        <template v-if="['file', 'image'].includes(selectedField.type)">
          <div class="props-section-title">上传配置</div>
          <el-form-item label="最大上传数">
            <el-input-number
              :model-value="selectedField.maxCount ?? 9"
              :min="1"
              :max="99"
              :step="1"
              style="width: 100%"
              @update:model-value="(value: number | undefined) => setUploadCount(selectedField, value)"
            />
            <span class="props-hint">默认 9 个，达到上限后隐藏上传按钮</span>
          </el-form-item>
          <el-form-item label="文件大小上限">
            <el-input-number
              :model-value="selectedField.maxSize ?? 10"
              :min="1"
              :max="2048"
              :step="1"
              style="width: 100%"
              @update:model-value="(value: number | undefined) => setUploadSize(selectedField, value)"
            />
            <span class="props-hint">单位 MB，超出时阻止上传并提示</span>
          </el-form-item>
          <el-form-item label="允许类型">
            <el-select
              :model-value="selectedField.acceptTypes ?? []"
              multiple
              collapse-tags
              collapse-tags-tooltip
              placeholder="不选则不限类型"
              style="width: 100%"
              @update:model-value="(value: string[]) => setAcceptTypes(selectedField, value)"
            >
              <el-option
                v-for="item in UPLOAD_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <span class="props-hint">可多选，如图片 + PDF + Excel</span>
          </el-form-item>
          <el-form-item label="自定义后缀">
            <el-input
              v-model="selectedField.accept"
              maxlength="200"
              placeholder="如 .dwg,.psd；留空不追加"
            />
          </el-form-item>
          <el-form-item label="上传提示">
            <el-input
              v-model="selectedField.tip"
              maxlength="200"
              placeholder="留空自动按数量/大小生成"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="['date', 'datetime'].includes(selectedField.type)"
          :label="formatLabelOf(selectedField.type)"
        >
          <el-select v-model="selectedField.dateFormat" style="width: 100%">
            <el-option
              v-for="item in formatOptionsOf(selectedField.type)"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span class="props-hint">{{ formatHintOf(selectedField.type) }}</span>
        </el-form-item>
        <template v-if="['qrcode', 'barcode'].includes(selectedField.type)">
          <div class="props-section-title">内容来源</div>
          <el-form-item label="内容来源">
            <el-radio-group v-model="selectedField.codeSource">
              <el-radio-button value="fixed">固定值</el-radio-button>
              <el-radio-button value="link">组件联动</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="selectedField.codeSource === 'fixed'" label="固定内容">
            <el-input
              v-model="selectedField.codeValue"
              maxlength="500"
              placeholder="每次都生成这个内容"
            />
          </el-form-item>
          <template v-else-if="selectedField.codeSource === 'link'">
            <el-form-item label="关联字段">
              <el-select
                v-model="selectedField.codeFields"
                multiple
                filterable
                placeholder="选择本表单其它字段"
                style="width: 100%"
              >
                <el-option
                  v-for="item in codeFieldOptions"
                  :key="item.name"
                  :label="item.label"
                  :value="item.name"
                />
              </el-select>
              <span class="props-hint">按选择顺序拼接这些字段当前输入的值</span>
            </el-form-item>
            <el-form-item label="拼接分隔符">
              <el-input
                v-model="selectedField.codeSeparator"
                maxlength="10"
                placeholder="例如 - 或 |，留空直接拼接"
              />
            </el-form-item>
          </template>
        </template>
        <template
          v-if="isPickerType(selectedField.type) && !isBuiltinPickerType(selectedField.type)"
        >
          <div class="props-section-title">数据源配置</div>
          <el-form-item label="数据来源">
            <div class="picker-source-row">
              <el-select
                :model-value="selectedField.sourceId ?? null"
                filterable
                clearable
                placeholder="请选择已发布的数据来源"
                style="width: 100%"
                :loading="pickerSourceLoading"
                @change="handlePickerSourceChange"
              >
                <el-option
                  v-for="item in pickerSourceOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-button link type="primary" title="刷新数据源列表" @click="loadPickerSources">
                刷新
              </el-button>
            </div>
            <span class="props-hint">{{ pickerSourceHint }}</span>
          </el-form-item>
          <el-form-item label="存储字段">
            <el-select
              v-model="selectedField.valueField"
              filterable
              clearable
              placeholder="选中行的哪一列作为写入值"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
            <span class="props-hint">
              写入当前控件绑定的数据库列；值含存储值+回显文本，建议绑定 varchar/text 列
            </span>
          </el-form-item>
          <el-form-item label="回显字段">
            <el-select
              v-model="selectedField.displayField"
              filterable
              clearable
              placeholder="选中行的哪一列作为显示文本"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="列表字段">
            <el-select
              :model-value="(selectedField.listFields ?? []).map((item) => item.key)"
              multiple
              filterable
              placeholder="弹框列表显示哪些列"
              style="width: 100%"
              :loading="pickerFieldsLoading"
              @change="handlePickerListFieldsChange"
            >
              <el-option
                v-for="item in pickerFieldOptions"
                :key="item.key"
                :label="item.label || item.key"
                :value="item.key"
              />
            </el-select>
            <span v-if="!pickerFieldOptions.length" class="props-hint">
              请先选择数据来源，字段列表会自动加载
            </span>
          </el-form-item>
          <el-form-item label="搜索字段">
            <el-select
              v-model="selectedField.keywordKey"
              filterable
              clearable
              placeholder="可选"
              style="width: 100%"
              :loading="pickerFieldsLoading"
            >
              <el-option
                v-for="item in pickerKeywordOptions"
                :key="item.key"
                :label="`${item.label || item.key}（${item.key}）`"
                :value="item.key"
              />
            </el-select>
            <span class="props-hint">
              关联表单需目标表单把它配成查询字段；弹框选择需接口声明同名参数
            </span>
          </el-form-item>
          <el-form-item label="选择模式">
            <el-switch
              :model-value="Boolean(selectedField.multiple)"
              active-text="多选"
              inactive-text="单选"
              @change="handlePickerMultipleChange"
            />
          </el-form-item>
          <el-form-item label="弹框标题">
            <el-input
              v-model="selectedField.pickerTitle"
              maxlength="100"
              placeholder="留空按控件标题生成"
            />
          </el-form-item>
        </template>
        <template v-else-if="isBuiltinPickerType(selectedField.type)">
          <div class="props-section-title">选择配置</div>
          <el-form-item label="数据来源">
            <el-tag type="info" effect="plain">
              {{ selectedField.type === 'userSelect' ? '系统用户' : '系统角色' }}
            </el-tag>
            <span class="props-hint">内置数据源，弹框自动加载，无需配置字段</span>
          </el-form-item>
          <el-form-item label="选择模式">
            <el-switch
              :model-value="Boolean(selectedField.multiple)"
              active-text="多选"
              inactive-text="单选"
              @change="handlePickerMultipleChange"
            />
          </el-form-item>
          <el-form-item label="弹框标题">
            <el-input
              v-model="selectedField.pickerTitle"
              maxlength="100"
              placeholder="留空按控件标题生成"
            />
          </el-form-item>
        </template>
        <template v-if="['number', 'slider'].includes(selectedField.type)">
          <el-form-item label="最小值">
            <el-input-number v-model="selectedField.min" style="width: 100%" />
          </el-form-item>
          <el-form-item label="最大值">
            <el-input-number v-model="selectedField.max" style="width: 100%" />
          </el-form-item>
          <el-form-item v-if="selectedField.type === 'slider'" label="步长">
            <el-input-number
              v-model="selectedField.step"
              :min="0.01"
              :precision="2"
              style="width: 100%"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="['select', 'radio', 'checkbox'].includes(selectedField.type)"
          label="选项"
        >
          <div class="option-list">
            <div v-for="(option, index) in selectedField.options" :key="index" class="option-row">
              <el-input v-model="option.label" placeholder="标签" />
              <el-input v-model="option.value" placeholder="值" />
              <el-button link type="danger" @click="removeOption(index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button link type="primary" @click="addOption">
              <el-icon><Plus /></el-icon>
              添加选项
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <!-- 明细列的组件样式：栅格只影响弹窗录入布局，宽度作用在单元格内的输入控件 -->
      <el-form
        v-if="propsTab === 'style' && selectedSubColumn"
        label-position="top"
        size="small"
        class="props-form"
      >
        <div class="props-section-title">组件样式</div>
        <el-form-item label="控件栅格（/24）">
          <div class="props-span">
            <el-slider
              v-model="subColumnSpanModel"
              :min="2"
              :max="24"
              :step="2"
              :marks="spanMarks"
              :show-tooltip="false"
            />
          </div>
          <span class="props-hint">弹窗录入时明细字段占几格，默认 12 格</span>
        </el-form-item>
        <el-form-item label="控件宽度">
          <el-input
            v-model="subControlWidthText"
            placeholder="100% 或 320px"
            class="props-width__input"
            @change="subControlWidthText = applyControlWidth(selectedSubColumn, subControlWidthText)"
          />
          <span class="props-hint">
            只影响输入控件本身：<b>320px</b> 为固定像素，<b>50%</b> 为单元格的一半，默认 100%
          </span>
        </el-form-item>
        <el-form-item v-if="selectedSubColumn.type === 'textarea'" label="行数">
          <el-input-number v-model="selectedSubColumn.rows" :min="2" :max="20" />
        </el-form-item>
        <p class="props-hint">样式改动会立刻反映到左侧画布，不需要保存</p>
      </el-form>

      <el-form
        v-else-if="propsTab === 'style' && selectedField"
        label-position="top"
        size="small"
        class="props-form"
      >
        <el-form-item label="控件栅格（/24）">
          <div class="props-span">
            <el-slider
              v-model="fieldSpanModel"
              :min="2"
              :max="24"
              :step="2"
              :marks="spanMarks"
              :show-tooltip="false"
            />
          </div>
          <span class="props-hint">控件在表单里占几格，默认 24 格；12 为半行</span>
        </el-form-item>
        <el-form-item label="标题宽度">
          <el-input-number
            v-model="selectedField.labelWidth"
            :min="40"
            :max="400"
            :step="10"
            controls-position="right"
            placeholder="跟随表单"
            style="width: 100%"
          />
          <span class="props-hint">
            单位 px，留空则跟随表单属性的「标签宽度」（当前 {{ labelWidth }}px）
          </span>
        </el-form-item>
        <el-form-item label="控件宽度">
          <el-input
            v-model="controlWidthText"
            placeholder="100% 或 320px"
            class="props-width__input"
            @change="controlWidthText = applyControlWidth(selectedField, controlWidthText)"
          />
          <span class="props-hint">
            默认 100% 撑满所在栅格；填 <b>320px</b> 为固定像素，填 <b>50%</b> 为栅格的一半，只影响输入控件本身
          </span>
        </el-form-item>
        <el-form-item v-if="selectedField.type === 'textarea'" label="行数">
          <el-input-number v-model="selectedField.rows" :min="2" :max="20" />
        </el-form-item>
        <p class="props-hint">样式改动会立刻反映到左侧画布，不需要保存</p>
      </el-form>

      <!-- 子表组件的组件属性：关联哪张从表 + 录入方式 -->
      <el-form
        v-else-if="propsTab === 'subtable' && selectedSubtable"
        label-position="top"
        size="small"
        class="props-form"
      >
        <div class="props-section-title">组件属性</div>
        <el-form-item label="关联子表">
          <el-select
            :model-value="selectedSubtable.tableName"
            filterable
            :placeholder="subtableChoices.length > 0 ? '请选择从表' : '暂无可关联的从表'"
            :disabled="subtableChoices.length === 0"
            style="width: 100%"
            @change="(value: string) => assignSubtableTable(selectedSubtable!, value)"
          >
            <el-option
              v-for="slave in subtableChoices"
              :key="slave.key"
              :label="`${slave.tableComment || slave.tableName}（${slave.tableName}）`"
              :value="slave.tableName"
            />
          </el-select>
          <span v-if="slaveTables.length === 0" class="props-hint">
            还没有从表，请先到第 1 步把明细表配成从表
          </span>
          <span v-else-if="subtableChoices.length === 0" class="props-hint">
            每张从表只能关联一个子表组件，可到第 1 步继续添加从表
          </span>
          <span v-else class="props-hint">同一张从表只能关联一个子表组件</span>
        </el-form-item>
        <el-form-item label="子表标题">
          <el-input v-model="selectedSubtable.label" maxlength="100" />
        </el-form-item>
        <el-form-item label="录入方式">
          <el-radio-group v-model="selectedSubtable.mode">
            <el-radio value="table">表格行内</el-radio>
            <el-radio value="dialog">弹窗编辑</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="主外键关联">
          <el-input
            :model-value="`${selectedSubtable.tableName || '—'}.${selectedSubtable.foreignKey || '—'} → ${tableName}.${selectedSubtable.masterColumn || '—'}`"
            disabled
          />
          <span class="props-hint">
            关系在「基础设计」中修改，外键列由运行时自动写入，不会出现在明细列里
          </span>
        </el-form-item>
        <p class="props-hint">
          明细列（{{ selectedSubtable.columns.length }} 个）从左侧控件库拖进子表区块后，
          选中列即可配置「控件字段 / 控件类型 / 组件样式」。
        </p>
      </el-form>

      <!-- 子表组件的组件样式 -->
      <el-form
        v-else-if="propsTab === 'substyle' && selectedSubtable"
        label-position="top"
        size="small"
        class="props-form"
      >
        <div class="props-section-title">组件样式</div>
        <el-form-item label="控件栅格（/24）">
          <div class="props-span">
            <el-slider
              v-model="subtableSpanModel"
              :min="2"
              :max="24"
              :step="2"
              :marks="spanMarks"
              :show-tooltip="false"
            />
          </div>
          <span class="props-hint">子表组件在主表单里占几格，默认 24 格（整行）</span>
        </el-form-item>
        <p class="props-hint">样式改动会立刻反映到左侧画布，不需要保存</p>
      </el-form>

      <el-form
        v-else-if="propsTab === 'form'"
        label-position="top"
        size="small"
        class="props-form"
      >
        <el-form-item label="标签位置">
          <el-select v-model="formSettings.labelPosition" style="width: 100%">
            <el-option label="左侧" value="left" />
            <el-option label="右侧" value="right" />
            <el-option label="顶部" value="top" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签宽度">
          <el-input-number v-model="labelWidth" :min="60" :max="240" style="width: 100%" />
        </el-form-item>
        <el-form-item label="表单尺寸">
          <el-select v-model="formSettings.formSize" style="width: 100%">
            <el-option
              v-for="item in FORM_SIZE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span class="props-hint">
            只决定控件尺寸（{{ elSizeOf(formSettings.formSize) }}），弹窗宽度在下方单独设置
          </span>
        </el-form-item>
        <el-form-item label="弹窗类型">
          <el-select v-model="formSettings.dialogType" style="width: 100%">
            <el-option
              v-for="item in DIALOG_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span class="props-hint">{{ dialogTypeHint }}</span>
        </el-form-item>
        <el-form-item label="表单宽度">
          <el-select
            v-model="dialogWidthModel"
            style="width: 100%"
            :disabled="formSettings.dialogType === 'fullscreen'"
          >
            <el-option label="默认（900px）" value="auto" />
            <el-option
              v-for="width in DIALOG_WIDTH_OPTIONS"
              :key="width"
              :label="width"
              :value="width"
            />
          </el-select>
          <span class="props-hint">{{ dialogWidthHint }}</span>
        </el-form-item>
        <el-form-item label="禁用整个表单">
          <el-switch v-model="formSettings.disabled" />
        </el-form-item>
        <el-form-item label="标签后缀">
          <el-input v-model="formSettings.labelSuffix" maxlength="20" placeholder="如：:" />
        </el-form-item>
        <el-form-item label="隐藏必填星号">
          <el-switch v-model="formSettings.hideRequiredAsterisk" />
        </el-form-item>
        <el-form-item label="显示校验信息">
          <el-switch v-model="formSettings.showMessage" />
        </el-form-item>
        <el-form-item label="校验状态图标">
          <el-switch v-model="formSettings.statusIcon" />
        </el-form-item>
        <div class="props-hint">表单字段：{{ fields.length }} / {{ businessColumns.length }}</div>
      </el-form>

      <!-- 空态只跟「有没有选中对象」有关：
            上方的组件属性是独立的 v-if 分支，v-else 只能挂到最近的一条 v-else-if 链上，
            否则 propsTab 为 field 时会同时渲染属性表单和这块空态提示 -->
      <el-empty
        v-else-if="!selectedField && !selectedSubColumn && !selectedSubtable"
        description="先在画布中选中一个控件，再配置组件属性与样式"
        :image-size="72"
      />
    </el-scrollbar>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { UPLOAD_TYPE_OPTIONS } from '@/components/form-controls';
import {
  DIALOG_TYPE_OPTIONS,
  DIALOG_WIDTH_OPTIONS,
  FORM_SIZE_OPTIONS,
  elSizeOf,
  formWidthOf,
  formatHintOf,
  formatLabelOf,
  formatOptionsOf,
  isDisplayOnly,
  isBuiltinPickerType,
  isPickerType,
  setAcceptTypes,
  setUploadCount,
  setUploadSize,
  spanMarks,
  typeLabels,
} from '../designer/model';
import { useDesigner } from '../designer/store';

const {
  addOption, applyControlWidth, assignSubtableTable, businessColumns, codeFieldOptions,
  columnOptionsFor, controlWidthText, fieldSpanModel, fields, formSettings,
  handleFieldTypeChange, handlePickerListFieldsChange, handlePickerMultipleChange,
  handlePickerSourceChange, handleSelectedColumnChange, handleSubColumnColumnChange,
  isColumnUsedByOther, isSubColumnUsedByOther, labelWidth, loadPickerSources, loading,
  pickerFieldOptions, pickerFieldsLoading, pickerKeywordOptions, pickerSourceHint,
  pickerSourceLoading, pickerSourceOptions, propsTab, propsTabs, removeOption,
  selectedColumn, selectedField, selectedSubColumn, selectedSubColumnSource,
  selectedSubColumnSubtable, selectedSubtable, slaveTables, step, subColumnOptions,
  subColumnSpanModel, subColumnTypeOptionsOf, subControlWidthText, subtableChoices,
  subtableSpanModel, tableName, typeOptionsOf,
} = useDesigner();

/** 弹窗类型的说明文字 */
const dialogTypeHint = computed(
  () => DIALOG_TYPE_OPTIONS.find((item) => item.value === formSettings.dialogType)?.hint ?? '',
);

/** 宽度下拉用 'auto' 作为哨兵：直接绑 null 时 el-select 匹配不到选项，只显示占位符 */
const dialogWidthModel = computed<number | string | 'auto'>({
  get: () => formSettings.dialogWidth ?? 'auto',
  set: (value) => {
    formSettings.dialogWidth = value === 'auto' ? null : value;
  },
});

/** 表单宽度说明：全屏时忽略宽度，其余情况显示实际生效值 */
const dialogWidthHint = computed(() => {
  if (formSettings.dialogType === 'fullscreen') return '全屏模式下宽度占满可视区域，无需设置';
  const width = formWidthOf(formSettings.dialogWidth);
  const mode = formSettings.dialogType === 'right' ? '抽屉宽度' : '弹窗宽度';
  const percent = width.endsWith('%') ? '（相对浏览器窗口）' : '';
  return `${mode} ${width}${percent}，预览与生成的代码保持一致`;
});
</script>

<style scoped lang="scss">
.props-section-title {
  margin: 4px 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.props-section-title:not(:first-child) {
  padding-top: 12px;
  margin-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.designer__panel-scroll {
  flex: 1;
  min-height: 0;
}

.designer__props {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 300px;
  min-height: 0;
  padding: 12px;
  border-left: 1px solid var(--el-border-color-lighter);
}

.props-form {
  padding-right: 4px;
}
.props-form .el-form-item{
  margin-bottom: 8px;
}

/* 右侧属性面板 tabs：组件属性 / 组件样式 / 表单属性 / 子表属性 */
.props-tabs {
  flex: none;
  margin: -4px 0 10px;
}

.props-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.props-tabs :deep(.el-tabs__item) {
  height: 34px;
  padding: 0 8px;
  font-size: 13px;
}

.props-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}


.props-hint {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-placeholder);
}

/* 高级控件：数据源下拉 + 刷新按钮 */
.picker-source-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.picker-source-row > .el-select {
  flex: 1;
  min-width: 0;
}

/* 控件宽度：手动输入 100% / 320px */
.props-width__input {
  width: 100%;
}

.props-width__input :deep(.el-input__inner) {
  font-variant-numeric: tabular-nums;
}

/* 控件栅格：两格一跳，刻度数字（2-4-6…24）标在滑轨下方 */
.props-span {
  width: 100%;
  padding-bottom: 22px;
}

.props-span :deep(.el-slider__marks-text) {
  margin-top: 8px;
  font-size: 10px;
  line-height: 1;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}

/* 首尾刻度靠边对齐，否则 translateX(-50%) 会被面板边缘裁掉一半 */
.props-span :deep(.el-slider__marks-text:first-child) {
  transform: translateX(0);
}

.props-span :deep(.el-slider__marks-text:last-child) {
  transform: translateX(-100%);
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.option-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.option-row :deep(.el-input) {
  width: 100%;
}
</style>
